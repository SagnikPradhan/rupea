import { and, asc, eq, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import {
	ledgerFiles,
	metadata as metadataTable,
	postings,
	transactions as transactionTable,
	users,
} from '#lib/server/db/schema.ts';
import { inOrder } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, err, ok, ResultAsync, type Result } from '#lib/server/shared/result.ts';
import { BALANCE_ROOTS, EVENT_KEYS } from '../domain/events';
import type { FileVersion } from '../domain/sync';
import {
	PriceKind,
	toMetadata,
	type Amount,
	type Price,
	type RupeeLedgerFile,
	type RupeeMetadata,
	type RupeeParseLocation,
	type RupeeTransaction,
} from '../domain/types';

export type IndexedTransaction = RupeeTransaction & { id: string };

// Well under Postgres's limit of 65535 parameters per statement.
const CHUNK = 500;

const chunks = <T>(l: T[]): T[][] =>
	Array.from({ length: Math.ceil(l.length / CHUNK) }, (_, i) =>
		l.slice(i * CHUNK, (i + 1) * CHUNK),
	);

const files = (ledgerId: string) => (): ResultAsync<FileVersion[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ key: ledgerFiles.key, version: ledgerFiles.version })
				.from(ledgerFiles)
				.where(eq(ledgerFiles.ledgerId, ledgerId)),
		),
	);

// One transaction, so readers see the old file or the new one.
const put =
	(ledgerId: string) =>
	(key: string, version: string | null, file: RupeeLedgerFile): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction(async (tx) => {
					const fileId = sql<string>`(${tx
						.select({ id: ledgerFiles.id })
						.from(ledgerFiles)
						.where(and(eq(ledgerFiles.ledgerId, ledgerId), eq(ledgerFiles.key, key)))})`;
					const indexed = file.transactions.map((t) => ({
						id: uuidv7(),
						transaction: t,
						postings: t.postings.map((p) => ({ id: uuidv7(), posting: p })),
					}));
					const transactionRows = indexed.map(({ id, transaction }) => ({
						id,
						fileId,
						line: transaction.location.line,
						date: transaction.date.toString(),
						time: transaction.time?.toString() ?? null,
						description: transaction.description,
					}));
					const postingRows = indexed.flatMap(({ id, postings: p }) =>
						p.map(({ id: postingId, posting }, position) => ({
							id: postingId,
							transactionId: id,
							position,
							account: posting.account,
							amount: posting.amount,
							commodity: posting.commodity,
							priceAmount: posting.price?.amount ?? null,
							priceCommodity: posting.price?.commodity ?? null,
							priceKind: posting.price?.kind ?? null,
							balance: posting.balance,
						})),
					);
					const metadataRows = [
						...ownedBy({ fileId }, file.metadata),
						...indexed.flatMap(({ id, transaction }) =>
							ownedBy({ transactionId: id }, transaction.metadata),
						),
						...indexed.flatMap(({ postings: p }) =>
							p.flatMap(({ id, posting }) => ownedBy({ postingId: id }, posting.metadata)),
						),
					];

					await tx
						.insert(ledgerFiles)
						.values({ ledgerId, key, version })
						.onConflictDoUpdate({
							target: [ledgerFiles.ledgerId, ledgerFiles.key],
							set: { version },
						});
					await tx.delete(metadataTable).where(eq(metadataTable.fileId, fileId));
					await tx.delete(transactionTable).where(eq(transactionTable.fileId, fileId));
					await inOrder([
						...chunks(transactionRows).map((c) => () => tx.insert(transactionTable).values(c)),
						...chunks(postingRows).map((c) => () => tx.insert(postings).values(c)),
						...chunks(metadataRows).map((c) => () => tx.insert(metadataTable).values(c)),
					]);
				}),
			),
		);

type MetadataOwner = { fileId: SQL<string> } | { transactionId: string } | { postingId: string };

const ownedBy = (o: MetadataOwner, m: RupeeMetadata) =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => ({ key, value: v })))
		.map((e, i) => ({ ...o, position: i, ...e }));

const remove =
	(ledgerId: string) =>
	(key: string): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.delete(ledgerFiles)
					.where(and(eq(ledgerFiles.ledgerId, ledgerId), eq(ledgerFiles.key, key)))
					.then(() => undefined),
			),
		);

const rename =
	(ledgerId: string) =>
	(from: string, to: string): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.update(ledgerFiles)
					.set({ key: to })
					.where(and(eq(ledgerFiles.ledgerId, ledgerId), eq(ledgerFiles.key, from)))
					.then(() => undefined),
			),
		);

const compareTimes = (a: Temporal.PlainTime | null, b: Temporal.PlainTime | null) =>
	a && b ? Temporal.PlainTime.compare(a, b) : Number(a !== null) - Number(b !== null);

const transactions = (l: string) => (): ResultAsync<IndexedTransaction[]> =>
	read(eq(ledgerFiles.ledgerId, l));

// Only transactions in an event, through the metadata `(key, value)` index.
const eventMembers = (ledgerId: string) => (): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		read(
			and(
				eq(ledgerFiles.ledgerId, ledgerId),
				inArray(
					transactionTable.id,
					db
						.select({ id: metadataTable.transactionId })
						.from(metadataTable)
						.where(inArray(metadataTable.key, EVENT_KEYS)),
				),
			),
		),
	);

// `where` narrows the ledger's files and transactions.
const read = (where: SQL | undefined): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		attempt(async () => {
			const rows = await db
				.select({
					key: ledgerFiles.key,
					id: transactionTable.id,
					line: transactionTable.line,
					date: transactionTable.date,
					time: transactionTable.time,
					description: transactionTable.description,
					postingId: postings.id,
					account: postings.account,
					amount: postings.amount,
					commodity: postings.commodity,
					priceAmount: postings.priceAmount,
					priceCommodity: postings.priceCommodity,
					priceKind: postings.priceKind,
					balance: postings.balance,
				})
				.from(ledgerFiles)
				.innerJoin(transactionTable, eq(transactionTable.fileId, ledgerFiles.id))
				.leftJoin(postings, eq(postings.transactionId, transactionTable.id))
				.where(where)
				.orderBy(asc(transactionTable.id), asc(postings.position));
			const owned = byOwner([
				...(await db
					.select({
						owner: metadataTable.transactionId,
						key: metadataTable.key,
						value: metadataTable.value,
					})
					.from(metadataTable)
					.innerJoin(transactionTable, eq(transactionTable.id, metadataTable.transactionId))
					.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
					.where(where)
					.orderBy(asc(metadataTable.position))),
				...(await db
					.select({
						owner: metadataTable.postingId,
						key: metadataTable.key,
						value: metadataTable.value,
					})
					.from(metadataTable)
					.innerJoin(postings, eq(postings.id, metadataTable.postingId))
					.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
					.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
					.where(where)
					.orderBy(asc(metadataTable.position))),
			]);

			return [...Map.groupBy(rows, (r) => r.id).values()]
				.flatMap(([head, ...tail]) => (head ? [{ head, rows: [head, ...tail] }] : []))
				.map(({ head, rows: group }) => ({
					id: head.id,
					location: { file: head.key, line: head.line },
					date: Temporal.PlainDate.from(head.date),
					time: head.time === null ? null : Temporal.PlainTime.from(head.time),
					description: head.description,
					metadata: owned[head.id] ?? {},
					postings: group.flatMap((r) =>
						r.postingId === null || r.account === null || r.amount === null || r.commodity === null
							? []
							: [
									{
										account: r.account,
										amount: r.amount as Amount,
										commodity: r.commodity,
										price: toPrice(r),
										balance: r.balance as Amount | null,
										metadata: owned[r.postingId] ?? {},
									},
								],
					),
				}))
				.sort(
					(a, b) =>
						Temporal.PlainDate.compare(a.date, b.date) ||
						compareTimes(a.time, b.time) ||
						a.location.file.localeCompare(b.location.file) ||
						a.location.line - b.location.line,
				);
		}),
	);

type PriceColumns = {
	priceAmount: bigint | null;
	priceCommodity: string | null;
	priceKind: 'unit' | 'total' | null;
};

const toPrice = ({ priceAmount, priceCommodity, priceKind }: PriceColumns): Price | null =>
	priceAmount === null || priceCommodity === null || priceKind === null
		? null
		: {
				amount: priceAmount as Amount,
				commodity: priceCommodity,
				kind: priceKind === 'unit' ? PriceKind.Unit : PriceKind.Total,
			};

const byIds =
	(ledgerId: string) =>
	(ids: string[]): ResultAsync<IndexedTransaction[]> =>
		ResultAsync.combine(
			chunks(ids).map((c) =>
				read(and(eq(ledgerFiles.ledgerId, ledgerId), inArray(transactionTable.id, c))),
			),
		).map((l) => l.flat());

export type CandidatePair = { ours: string; theirs: string };

const ourFile = alias(ledgerFiles, 'our_file');
const ourTransaction = alias(transactionTable, 'our_transaction');
const ourPosting = alias(postings, 'our_posting');
const theirFile = alias(ledgerFiles, 'their_file');
const theirTransaction = alias(transactionTable, 'their_transaction');
const theirPosting = alias(postings, 'their_posting');

// Same date, amount and balance account, in another file; the other side goes
// through the `(account, amount)` index.
const candidates =
	(ledgerId: string) =>
	(key: string): ResultAsync<CandidatePair[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.selectDistinct({ ours: ourTransaction.id, theirs: theirTransaction.id })
					.from(ourFile)
					.innerJoin(ourTransaction, eq(ourTransaction.fileId, ourFile.id))
					.innerJoin(ourPosting, eq(ourPosting.transactionId, ourTransaction.id))
					.innerJoin(
						theirPosting,
						and(
							eq(theirPosting.account, ourPosting.account),
							eq(theirPosting.commodity, ourPosting.commodity),

							eq(theirPosting.amount, ourPosting.amount),
						),
					)
					.innerJoin(
						theirTransaction,
						and(
							eq(theirTransaction.id, theirPosting.transactionId),
							eq(theirTransaction.date, ourTransaction.date),
						),
					)
					.innerJoin(
						theirFile,
						and(
							eq(theirFile.id, theirTransaction.fileId),
							eq(theirFile.ledgerId, ledgerId),
							ne(theirFile.id, ourFile.id),
						),
					)
					.where(
						and(
							eq(ourFile.ledgerId, ledgerId),
							eq(ourFile.key, key),
							isBalance(ourPosting.account),
						),
					),
			),
		);

const isBalance = (a: PgColumn) =>
	or(...BALANCE_ROOTS.flatMap((r) => [eq(a, r), like(a, `${r}:%`)]));

// Every member of every event a transaction in the file belongs to.
const eventsIn =
	(ledgerId: string) =>
	(key: string): ResultAsync<IndexedTransaction[]> =>
		withContext('db')((db) =>
			read(
				and(
					eq(ledgerFiles.ledgerId, ledgerId),
					inArray(
						transactionTable.id,
						db
							.select({ id: metadataTable.transactionId })
							.from(metadataTable)
							.where(
								and(
									inArray(metadataTable.key, EVENT_KEYS),
									inArray(
										metadataTable.value,
										db
											.select({ value: metadataTable.value })
											.from(metadataTable)
											.innerJoin(
												transactionTable,
												eq(transactionTable.id, metadataTable.transactionId),
											)
											.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
											.where(
												and(
													eq(ledgerFiles.ledgerId, ledgerId),
													eq(ledgerFiles.key, key),
													inArray(metadataTable.key, EVENT_KEYS),
												),
											),
									),
								),
							),
					),
				),
			),
		);

const membersOf =
	(ledgerId: string) =>
	(event: string): ResultAsync<IndexedTransaction[]> =>
		withContext('db')((db) =>
			read(
				and(
					eq(ledgerFiles.ledgerId, ledgerId),
					inArray(
						transactionTable.id,
						db
							.select({ id: metadataTable.transactionId })
							.from(metadataTable)
							.where(and(inArray(metadataTable.key, EVENT_KEYS), eq(metadataTable.value, event))),
					),
				),
			),
		);

const eventIdTaken =
	(ledgerId: string) =>
	(id: string): ResultAsync<boolean> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.select({ id: metadataTable.id })
					.from(metadataTable)
					.innerJoin(transactionTable, eq(transactionTable.id, metadataTable.transactionId))
					.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
					.where(
						and(
							eq(ledgerFiles.ledgerId, ledgerId),
							inArray(metadataTable.key, EVENT_KEYS),
							eq(metadataTable.value, id),
						),
					)
					.limit(1),
			).map((r) => r.length > 0),
		);

// `unordered` holds postings that could fall either side of the assertion.
export type BalanceCheck = {
	location: RupeeParseLocation;
	account: string;
	commodity: string;
	expected: Amount;
	actual: Amount;
	unordered: string[];
};

type BalanceRow = {
	file: string;
	line: number;
	account: string;
	commodity: string;
	expected: string;
	actual: string;
	unordered: string[];
};

// An assertion is a point in time on its account: every counted posting before
// it, in any file. A file is a sequence, so its own postings that day are
// ordered by line; another file's are ordered only when both sides have a time.
const balanceChecks =
	(ledgerId: string) =>
	(evidence: string[]): ResultAsync<BalanceCheck[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db.execute<BalanceRow>(sql`
					with asserted as (
						select distinct p.account, p.commodity
						from ${postings} p
						join ${transactionTable} t on t.id = p.transaction_id
						join ${ledgerFiles} f on f.id = t.file_id
						where f.ledger_id = ${ledgerId} and p.balance is not null
					),
					entries as (
						select f.key as file, t.line, t.date, t.time, p.position, p.account, p.commodity, p.amount, p.balance,
							t.id <> all(${sql.param(evidence)}::uuid[]) as counted
						from ${postings} p
						join ${transactionTable} t on t.id = p.transaction_id
						join ${ledgerFiles} f on f.id = t.file_id
						where f.ledger_id = ${ledgerId} and (p.account, p.commodity) in (select account, commodity from asserted)
					),
					days as (
						select account, commodity, date, sum(case when counted then amount else 0 end) as total
						from entries
						group by account, commodity, date
					),
					openings as (
						select account, commodity, date, sum(total) over (partition by account, commodity order by date) - total as opening
						from days
					),
					checks as (
						select a.file, a.line, a.account, a.commodity, a.balance,
							o.opening + coalesce(sum(e.amount) filter (where
								(e.file = a.file and (e.line < a.line or (e.line = a.line and e.position <= a.position)))
								or (e.file != a.file and e.time < a.time)
							), 0) as actual,
							coalesce(array_agg(distinct e.file || ':' || e.line) filter (where
								e.file != a.file and (e.time is null or a.time is null or e.time = a.time)
							), '{}') as unordered
						from entries a
						join openings o on o.account = a.account and o.commodity = a.commodity and o.date = a.date
						left join entries e on e.account = a.account and e.commodity = a.commodity and e.date = a.date and e.counted
						where a.balance is not null
						group by a.file, a.line, a.position, a.account, a.commodity, a.balance, o.opening
					)
					select file, line, account, commodity, balance::text as expected, actual::text as actual, unordered
					from checks
					where balance != actual or cardinality(unordered) > 0
					order by file, line
				`),
			).map((r) =>
				r.rows.map((c) => ({
					location: { file: c.file, line: c.line },
					account: c.account,
					commodity: c.commodity,
					expected: BigInt(c.expected) as Amount,
					actual: BigInt(c.actual) as Amount,
					unordered: c.unordered,
				})),
			),
		);

type MetadataRow = { owner: string | null; key: string; value: string };

// Rows come in written order, which `toMetadata` keeps.
const byOwner = (rows: MetadataRow[]): Record<string, RupeeMetadata> =>
	Object.fromEntries(
		Object.entries(Object.groupBy(rows, (r) => r.owner ?? '')).map(([owner, group = []]) => [
			owner,
			toMetadata(group.map((r) => [r.key, r.value])),
		]),
	);

export const index = (ledgerId: string) => ({
	files: files(ledgerId),
	put: put(ledgerId),
	remove: remove(ledgerId),
	rename: rename(ledgerId),
	eventMembers: eventMembers(ledgerId),
	byIds: byIds(ledgerId),
	candidates: candidates(ledgerId),
	eventIdTaken: eventIdTaken(ledgerId),
	eventsIn: eventsIn(ledgerId),
	membersOf: membersOf(ledgerId),
	balanceChecks: balanceChecks(ledgerId),
	transactions: transactions(ledgerId),
});

export const findLedgerId = (userId: string): ResultAsync<string> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ ledgerId: users.ledgerId })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)
				.then(([f]) => f),
		).andThen((f): Result<string> =>
			f?.ledgerId ? ok(f.ledgerId) : err({ type: 'LedgerNotFound', userId, cause: [] }),
		),
	);
