import { attemptWrite, violates } from '#lib/server/db/errors.ts';
import { statementChunks, vectorText, type Database } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { inOrder } from '#lib/server/shared/control.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, err, errAsync, ok, ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import { EVENT_KEYS } from '../domain/events';
import type { Holding } from '../domain/holdings';
import { book, realised, type BookedPosting, type Booking, CURRENCIES } from '../domain/lots';
import { displayLocation, toMetadata } from '../domain/parser';
import { marketPrices } from '../domain/prices';
import type { FileVersion } from '../domain/sync';
import { accountType, BALANCE_TYPES } from '../domain/taxonomy';
import type { Filled, Unembedded } from '../domain/text';
import {
	AccountType,
	DisposalKind,
	LotOrigin,
	PriceKind,
	PriceSource,
	type Ledger,
	type LotCost,
	type Price,
	type RupeeLedgerFile,
	type RupeeMetadata,
	type RupeeParseLocation,
	type RupeeTransaction,
} from '../domain/types';
import {
	disposals as disposalTable,
	ledgerFiles,
	ledgers,
	lots as lotTable,
	memberships,
	metadata as metadataTable,
	postings,
	prices as priceTable,
	transactions as transactionTable,
} from './database-schema';

export type IndexedTransaction = RupeeTransaction & { id: string };

const files = (ledgerId: string) => (): ResultAsync<FileVersion[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ key: ledgerFiles.key, version: ledgerFiles.version })
				.from(ledgerFiles)
				.where(eq(ledgerFiles.ledgerId, ledgerId)),
		),
	);

// One transaction, so readers see the old file or the new one. A description
// keeps its embedding through a reindex, so saving a file never re-embeds it.
const put =
	(ledgerId: string) =>
	(key: string, version: string | null, file: RupeeLedgerFile): ResultAsync<string[]> => {
		const untyped = untypedAccount(file);
		if (untyped) return errAsync(untyped);

		return withContext('db')((db) =>
			attempt(() =>
				db.transaction(async (tx) => {
					const fileId = await tx
						.insert(ledgerFiles)
						.values({ ledgerId, key, version })
						.onConflictDoUpdate({
							target: [ledgerFiles.ledgerId, ledgerFiles.key],
							set: { version },
						})
						.returning({ id: ledgerFiles.id })
						.then(([f]) => f?.id ?? Promise.reject(new Error(`${key} was not saved`)));
					const embedded = await embeddingsIn(tx, fileId);

					const indexed = file.transactions.map((t) => ({
						id: uuidv7(),
						transaction: t,
						postings: t.postings.map((p) => ({ id: uuidv7(), posting: p })),
					}));

					const transactionRows = indexed.map(({ id, transaction }) => ({
						id,
						ledgerId,
						fileId,
						line: transaction.location.line,
						date: transaction.date.toString(),
						time: transaction.time?.toString() ?? null,
						description: transaction.description,
						embedding: embedded[transaction.description]?.embedding ?? null,
						embeddingModel: embedded[transaction.description]?.embeddingModel ?? null,
					}));
					const postingRows = indexed.flatMap(({ id, postings: p }) =>
						p.flatMap(({ id: postingId, posting }, position) => {
							const type = accountType(posting.account);
							return type
								? [
										{
											id: postingId,
											ledgerId,
											transactionId: id,
											position,
											account: posting.account,
											accountType: type,
											amount: posting.amount,
											commodity: posting.commodity,
											priceAmount: posting.price?.amount ?? null,
											priceCommodity: posting.price?.commodity ?? null,
											priceKind: posting.price?.kind ?? null,
											costAmount: posting.cost?.amount ?? null,
											costCommodity: posting.cost?.commodity ?? null,
											costDate: posting.cost?.date?.toString() ?? null,
											balance: posting.balance,
										},
									]
								: [];
						}),
					);
					const priceRows = marketPrices(file).map((p) => ({
						ledgerId,
						fileId,
						line: p.location.line,
						date: p.date.toString(),
						commodity: p.commodity,
						priceAmount: p.price.amount,
						priceCommodity: p.price.commodity,
						source: p.source,
					}));
					const metadataRows = [
						...ownedBy({ ledgerId, fileId }, file.metadata),
						...indexed.flatMap(({ id, transaction }) =>
							ownedBy({ ledgerId, transactionId: id }, transaction.metadata),
						),
						...indexed.flatMap(({ postings: p }) =>
							p.flatMap(({ id, posting }) =>
								ownedBy({ ledgerId, postingId: id }, posting.metadata),
							),
						),
					];

					const before = await lotCommoditiesOf(tx, fileId);
					await tx.delete(metadataTable).where(eq(metadataTable.fileId, fileId));
					await tx.delete(transactionTable).where(eq(transactionTable.fileId, fileId));
					await tx.delete(priceTable).where(eq(priceTable.fileId, fileId));
					// A transaction's statements share one connection, so they go one at a time.
					await inOrder([
						...statementChunks(transactionRows).map(
							(c) => () => tx.insert(transactionTable).values(c),
						),
						...statementChunks(postingRows).map((c) => () => tx.insert(postings).values(c)),
						...statementChunks(priceRows).map((c) => () => tx.insert(priceTable).values(c)),
						...statementChunks(metadataRows).map((c) => () => tx.insert(metadataTable).values(c)),
					]);
					const after = await lotCommoditiesOf(tx, fileId);

					return [...before, ...after];
				}),
			),
		);
	};

// The parser already refuses these; checked again so no posting goes unindexed.
const untypedAccount = (file: RupeeLedgerFile): RupeeError | null =>
	file.transactions
		.flatMap((t) =>
			t.postings
				.filter((p) => !accountType(p.account))
				.map((p) =>
					fault('ParseInvalidAccount', {
						location: displayLocation(t.location),
						account: p.account,
					}),
				),
		)
		.at(0) ?? null;

type Embedded = { embedding: number[] | null; embeddingModel: string | null };

const embeddingsIn = (db: Database, fileId: string): Promise<Record<string, Embedded>> =>
	db
		.selectDistinctOn([transactionTable.description], {
			description: transactionTable.description,
			embedding: transactionTable.embedding,
			embeddingModel: transactionTable.embeddingModel,
		})
		.from(transactionTable)
		.where(and(eq(transactionTable.fileId, fileId), isNotNull(transactionTable.embedding)))
		.then((l) => Object.fromEntries(l.map((r) => [r.description, r])));

type MetadataOwner = { ledgerId: string } & (
	{ fileId: string } | { transactionId: string } | { postingId: string }
);

const ownedBy = (o: MetadataOwner, m: RupeeMetadata) =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => ({ key, value: v })))
		.map((e, i) => ({ ...o, position: i, ...e }));

const remove =
	(ledgerId: string) =>
	(key: string): ResultAsync<string[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction(async (tx) => {
					const [file] = await tx
						.select({ id: ledgerFiles.id })
						.from(ledgerFiles)
						.where(and(eq(ledgerFiles.ledgerId, ledgerId), eq(ledgerFiles.key, key)));
					if (!file) return [];

					const touched = await lotCommoditiesOf(tx, file.id);
					await tx.delete(ledgerFiles).where(eq(ledgerFiles.id, file.id));
					return touched;
				}),
			),
		);

const rename =
	(ledgerId: string) =>
	(from: string, to: string): ResultAsync<string[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.update(ledgerFiles)
					.set({ key: to })
					.where(and(eq(ledgerFiles.ledgerId, ledgerId), eq(ledgerFiles.key, from)))
					.returning({ id: ledgerFiles.id })
					.then(([file]) => (file ? lotCommoditiesOf(db, file.id) : [])),
			),
		);

const compareTimes = (a: Temporal.PlainTime | null, b: Temporal.PlainTime | null) =>
	a && b ? Temporal.PlainTime.compare(a, b) : Number(a !== null) - Number(b !== null);

const transactions = (l: string) => (): ResultAsync<IndexedTransaction[]> => read(l, undefined);

// Only transactions in an event, through the metadata `(ledger_id, key, value)` index.
const eventMembers = (ledgerId: string) => (): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		read(
			ledgerId,
			inArray(
				transactionTable.id,
				db
					.select({ id: metadataTable.transactionId })
					.from(metadataTable)
					.where(and(eq(metadataTable.ledgerId, ledgerId), inArray(metadataTable.key, EVENT_KEYS))),
			),
		),
	);

// `narrow` picks among the ledger's transactions. One snapshot, so the
// metadata read always belongs to the transactions read.
const read = (ledgerId: string, narrow: SQL | undefined): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction((t) => readIn(t, and(eq(transactionTable.ledgerId, ledgerId), narrow)), {
				isolationLevel: 'repeatable read',
				accessMode: 'read only',
			}),
		),
	);

const readIn = async (db: Database, where: SQL | undefined): Promise<IndexedTransaction[]> => {
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
			costAmount: postings.costAmount,
			costCommodity: postings.costCommodity,
			costDate: postings.costDate,
			balance: postings.balance,
		})
		.from(transactionTable)
		.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
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
								cost: toCost(r),
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
};

type PriceColumns = {
	priceAmount: bigint | null;
	priceCommodity: string | null;
	priceKind: PriceKind | null;
};

const toPrice = ({ priceAmount, priceCommodity, priceKind }: PriceColumns): Price | null =>
	priceAmount === null || priceCommodity === null || priceKind === null
		? null
		: {
				amount: priceAmount as Amount,
				commodity: priceCommodity,
				kind: priceKind,
			};

type CostColumns = {
	costAmount: bigint | null;
	costCommodity: string | null;
	costDate: string | null;
};

const toCost = ({ costAmount, costCommodity, costDate }: CostColumns): LotCost | null =>
	costAmount === null || costCommodity === null
		? null
		: {
				amount: costAmount as Amount,
				commodity: costCommodity,
				date: costDate === null ? null : Temporal.PlainDate.from(costDate),
			};

type QuantityColumns = { amount: bigint | null; commodity: string | null };

const toQuantity = ({ amount, commodity }: QuantityColumns): Quantity | null =>
	amount === null || commodity === null ? null : { amount: amount as Amount, commodity };

const byIds =
	(ledgerId: string) =>
	(l: string[]): ResultAsync<IndexedTransaction[]> =>
		ResultAsync.combine(
			statementChunks(l).map((c) => read(ledgerId, inArray(transactionTable.id, c))),
		).map((r) => r.flat());

export type CandidatePair = { ours: string; theirs: string };

const ourFile = alias(ledgerFiles, 'our_file');
const ourTransaction = alias(transactionTable, 'our_transaction');
const ourPosting = alias(postings, 'our_posting');

const theirTransaction = alias(transactionTable, 'their_transaction');
const theirPosting = alias(postings, 'their_posting');

// Same date, amount and balance account, in another file; the other side goes
// through the `(ledger_id, account, commodity, amount)` index.
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
							eq(theirPosting.ledgerId, ledgerId),
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
							ne(theirTransaction.fileId, ourFile.id),
						),
					)
					.where(
						and(
							eq(ourFile.ledgerId, ledgerId),
							eq(ourFile.key, key),
							inArray(ourPosting.accountType, BALANCE_TYPES),
						),
					),
			),
		);

// The event ids the file's transactions name, through the metadata index.
const eventsOfFile = (db: Database, ledgerId: string, key: string) =>
	db
		.select({ value: metadataTable.value })
		.from(metadataTable)
		.innerJoin(transactionTable, eq(transactionTable.id, metadataTable.transactionId))
		.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
		.where(
			and(
				eq(metadataTable.ledgerId, ledgerId),
				eq(ledgerFiles.key, key),
				inArray(metadataTable.key, EVENT_KEYS),
			),
		);

// Every member of every event a transaction in the file belongs to.
const eventsIn =
	(ledgerId: string) =>
	(key: string): ResultAsync<IndexedTransaction[]> =>
		withContext('db')((db) =>
			read(
				ledgerId,
				inArray(
					transactionTable.id,
					db
						.select({ id: metadataTable.transactionId })
						.from(metadataTable)
						.where(
							and(
								eq(metadataTable.ledgerId, ledgerId),
								inArray(metadataTable.key, EVENT_KEYS),
								inArray(metadataTable.value, eventsOfFile(db, ledgerId, key)),
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
				ledgerId,
				inArray(
					transactionTable.id,
					db
						.select({ id: metadataTable.transactionId })
						.from(metadataTable)
						.where(
							and(
								eq(metadataTable.ledgerId, ledgerId),
								inArray(metadataTable.key, EVENT_KEYS),
								eq(metadataTable.value, event),
							),
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
					.where(
						and(
							eq(metadataTable.ledgerId, ledgerId),
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
	(uncounted: string[]): ResultAsync<BalanceCheck[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db.execute<BalanceRow>(sql`
					with asserted as (
						select distinct p.account, p.commodity
						from ${postings} p
						where p.ledger_id = ${ledgerId} and p.balance is not null
					),
					entries as (
						select f.key as file, t.line, t.date, t.time, p.position, p.account, p.commodity, p.amount, p.balance,
							t.id <> all(${sql.param(uncounted)}::uuid[]) as counted
						from ${postings} p
						join ${transactionTable} t on t.id = p.transaction_id
						join ${ledgerFiles} f on f.id = t.file_id
						where p.ledger_id = ${ledgerId} and (p.account, p.commodity) in (select account, commodity from asserted)
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

const LEDGER_ORDER = [
	asc(transactionTable.date),
	sql`${transactionTable.time} asc nulls first`,
	asc(ledgerFiles.key),
	asc(transactionTable.line),
];

const lotCommoditiesOf = (db: Database, fileId: string): Promise<string[]> =>
	db
		.selectDistinct({ commodity: postings.commodity })
		.from(postings)
		.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
		.where(
			and(
				eq(transactionTable.fileId, fileId),
				inArray(postings.accountType, BALANCE_TYPES),
				sql`${postings.commodity} <> all(${sql.param(CURRENCIES)}::text[])`,
			),
		)
		.then((r) => r.map((c) => c.commodity));

const rebook =
	(ledgerId: string) =>
	(commodities: string[], uncounted: string[]): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction(async (tx) => {
					for (const commodity of commodities) {
						const booking = book(await bookedPostings(tx, { ledgerId, commodity, uncounted }));
						await replaceLots(tx, { ledgerId, commodity, booking });
					}
				}),
			),
		);

type BookedPostingsOptions = { ledgerId: string; commodity: string; uncounted: string[] };

const bookedPostings = (db: Database, options: BookedPostingsOptions): Promise<BookedPosting[]> =>
	db
		.select({
			id: postings.id,
			transactionId: postings.transactionId,
			account: postings.account,
			accountType: postings.accountType,
			date: transactionTable.date,
			amount: postings.amount,
			priceAmount: postings.priceAmount,
			priceCommodity: postings.priceCommodity,
			priceKind: postings.priceKind,
			costAmount: postings.costAmount,
			costCommodity: postings.costCommodity,
			costDate: postings.costDate,
		})
		.from(postings)
		.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
		.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
		.where(
			and(
				eq(postings.ledgerId, options.ledgerId),
				eq(postings.commodity, options.commodity),
				sql`${transactionTable.id} <> all(${sql.param(options.uncounted)}::uuid[])`,
			),
		)
		.orderBy(...LEDGER_ORDER, asc(postings.position))
		.then((rows) =>
			rows.map((row) => ({
				id: row.id,
				transaction: row.transactionId,
				account: row.account,
				held: BALANCE_TYPES.some((t) => t === row.accountType),
				date: Temporal.PlainDate.from(row.date),
				amount: row.amount as Amount,
				price: toPrice(row),
				cost: toCost(row),
			})),
		);

type ReplaceLotsOptions = { ledgerId: string; commodity: string; booking: Booking };

const replaceLots = async (db: Database, options: ReplaceLotsOptions) => {
	const { ledgerId, commodity, booking } = options;

	const lotRows = booking.lots.map((lot) => ({
		id: lot.id,
		ledgerId,
		commodity,
		postingId: lot.posting,
		sourceId: lot.source,
		account: lot.account,
		origin: lot.origin,
		date: lot.date.toString(),
		units: lot.units,
		remaining: lot.remaining,
		costAmount: lot.cost.amount,
		costCommodity: lot.cost.commodity,
	}));
	const disposalRows = booking.disposals.map((disposal) => ({
		ledgerId,
		commodity,
		lotId: disposal.lot,
		postingId: disposal.posting,
		kind: disposal.kind,
		units: disposal.units,
		priceAmount: disposal.price?.amount ?? null,
		priceCommodity: disposal.price?.commodity ?? null,
	}));

	await db
		.delete(disposalTable)
		.where(and(eq(disposalTable.ledgerId, ledgerId), eq(disposalTable.commodity, commodity)));
	await db
		.delete(lotTable)
		.where(and(eq(lotTable.ledgerId, ledgerId), eq(lotTable.commodity, commodity)));
	await inOrder([
		...statementChunks(lotRows).map((c) => () => db.insert(lotTable).values(c)),
		...statementChunks(disposalRows).map((c) => () => db.insert(disposalTable).values(c)),
	]);
};

export type UnmatchedDisposal = {
	location: RupeeParseLocation;
	account: string;
	commodity: string;
	kind: DisposalKind;
	units: Amount;
	named: boolean;
};

const unmatched = (ledgerId: string) => (): ResultAsync<UnmatchedDisposal[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({
					file: ledgerFiles.key,
					line: transactionTable.line,
					account: postings.account,
					commodity: disposalTable.commodity,
					kind: disposalTable.kind,
					units: disposalTable.units,
					costAmount: postings.costAmount,
				})
				.from(disposalTable)
				.innerJoin(postings, eq(postings.id, disposalTable.postingId))
				.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
				.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
				.where(and(eq(disposalTable.ledgerId, ledgerId), isNull(disposalTable.lotId)))
				.orderBy(asc(ledgerFiles.key), asc(transactionTable.line)),
		).map((rows) =>
			rows.map((row) => ({
				location: { file: row.file, line: row.line },
				account: row.account,
				commodity: row.commodity,
				kind: row.kind,
				units: row.units as Amount,
				named: row.costAmount !== null,
			})),
		),
	);

const holdings =
	(ledgerId: string) =>
	(uncounted: string[]): ResultAsync<Holding[]> =>
		withContext('db')((db) => {
			const balances = db
				.select({
					account: postings.account,
					commodity: postings.commodity,
					units: sql<string>`sum(${postings.amount})::text`.as('units'),
				})
				.from(postings)
				.where(
					and(
						eq(postings.ledgerId, ledgerId),
						inArray(postings.accountType, BALANCE_TYPES),
						sql`${postings.transactionId} <> all(${sql.param(uncounted)}::uuid[])`,
					),
				)
				.groupBy(postings.account, postings.commodity)
				.having(sql`sum(${postings.amount}) <> 0`)
				.as('balances');
			const costs = db
				.select({
					account: lotTable.account,
					commodity: lotTable.commodity,
					costAmount:
						sql<string>`sum(round(${lotTable.remaining}::numeric * ${lotTable.costAmount} / ${sql.raw(AMOUNT_UNIT.toString())}))::text`.as(
							'cost_amount',
						),
					costCommodity: sql<
						string | null
					>`case when count(distinct ${lotTable.costCommodity}) = 1 then min(${lotTable.costCommodity}) end`.as(
						'cost_commodity',
					),
				})
				.from(lotTable)
				.where(and(eq(lotTable.ledgerId, ledgerId), ne(lotTable.remaining, 0n)))
				.groupBy(lotTable.account, lotTable.commodity)
				.as('costs');

			return attempt(() =>
				db
					.select({
						account: balances.account,
						commodity: balances.commodity,
						units: balances.units,
						costAmount: costs.costAmount,
						costCommodity: costs.costCommodity,
					})
					.from(balances)
					.leftJoin(
						costs,
						and(eq(costs.account, balances.account), eq(costs.commodity, balances.commodity)),
					)
					.orderBy(asc(balances.account), asc(balances.commodity)),
			).map((rows) =>
				rows.map((row) => ({
					account: row.account,
					commodity: row.commodity,
					units: BigInt(row.units) as Amount,
					cost: toQuantity({
						amount: row.costAmount === null ? null : BigInt(row.costAmount),
						commodity: row.costCommodity,
					}),
				})),
			);
		});

type LatestPriceRow = { commodity: string; priceAmount: string; priceCommodity: string };

const latestPrices =
	(ledgerId: string) =>
	(commodities: string[], day: Temporal.PlainDate): ResultAsync<Record<string, Quantity>> =>
		withContext('db')((db) =>
			attempt(() =>
				db.execute<LatestPriceRow>(sql`
					select c.commodity, p.amount::text as "priceAmount", p.currency as "priceCommodity"
					from unnest(${sql.param(commodities)}::text[]) as c(commodity)
					cross join lateral (${priceOn(ledgerId, sql`c.commodity`, sql`${day.toString()}::date`)}) p
				`),
			).map((result) =>
				Object.fromEntries(
					result.rows.map((row) => [
						row.commodity,
						{ amount: BigInt(row.priceAmount) as Amount, commodity: row.priceCommodity },
					]),
				),
			),
		);

/** What balance accounts were worth in rupees at the end of one day, and how many commodities had no price. */
export type Worth = {
	day: Temporal.PlainDate;
	assets: Amount;
	liabilities: Amount;
	worth: Amount;
	unpriced: number;
};

type WorthRow = {
	day: string;
	assets: string;
	liabilities: string;
	worth: string;
	unpriced: number;
};

/**
 * Each day values its balances at the latest price on or before it, reaching rupees in at most
 * two prices and rounding each step as multiply does. The first day is the later of from and the
 * ledger's first counted transaction.
 */
const worth =
	(ledgerId: string) =>
	(evidence: string[], from: Temporal.PlainDate, to: Temporal.PlainDate): ResultAsync<Worth[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db.execute<WorthRow>(sql`
					with deltas as (
						select p.account_type = ${AccountType.Assets} as asset, p.commodity, t.date, sum(p.amount) as amount
						from ${postings} p
						join ${transactionTable} t on t.id = p.transaction_id
						where p.ledger_id = ${ledgerId} and p.account_type in (${AccountType.Assets}, ${AccountType.Liabilities})
							and t.date <= ${to.toString()} and t.id <> all(${sql.param(evidence)}::uuid[])
						group by 1, 2, 3
					),
					days as (
						select d::date as day
						from (select min(date) as first from deltas) f,
							generate_series(greatest(${from.toString()}::date, f.first), ${to.toString()}::date, interval '1 day') d
						where f.first is not null
					),
					keys as (
						select asset, commodity, sum(amount) filter (where date < (select min(day) from days)) as opening
						from deltas
						group by asset, commodity
					),
					balances as (
						select k.asset, k.commodity, d.day,
							coalesce(k.opening, 0) + sum(coalesce(x.amount, 0)) over (partition by k.asset, k.commodity order by d.day) as units
						from keys k
						cross join days d
						left join deltas x on x.asset = k.asset and x.commodity = k.commodity and x.date = d.day
					),
					valued as (
						select b.day, b.asset,
							case
								when b.commodity = ${DEFAULT_COMMODITY} then b.units
								when p1.currency = ${DEFAULT_COMMODITY} then round(b.units * p1.amount / ${UNIT})
								when p2.currency = ${DEFAULT_COMMODITY} then round(b.units * round(p1.amount * p2.amount / ${UNIT}) / ${UNIT})
							end as value
						from balances b
						left join lateral (${priceOn(ledgerId, sql`b.commodity`, sql`b.day`)}) p1 on b.commodity <> ${DEFAULT_COMMODITY}
						left join lateral (${priceOn(ledgerId, sql`p1.currency`, sql`b.day`)}) p2 on p1.currency <> ${DEFAULT_COMMODITY}
						where b.units <> 0
					)
					select d.day::text as day,
						coalesce(sum(v.value) filter (where v.asset), 0)::text as assets,
						coalesce(-sum(v.value) filter (where not v.asset), 0)::text as liabilities,
						coalesce(sum(v.value), 0)::text as worth,
						count(v.day) filter (where v.value is null)::int as unpriced
					from days d
					left join valued v on v.day = d.day
					group by d.day
					order by d.day
				`),
			).map((r) =>
				r.rows.map((w) => ({
					day: Temporal.PlainDate.from(w.day),
					assets: BigInt(w.assets) as Amount,
					liabilities: BigInt(w.liabilities) as Amount,
					worth: BigInt(w.worth) as Amount,
					unpriced: w.unpriced,
				})),
			),
		);

const UNIT = sql.raw(AMOUNT_UNIT.toString());

/** The latest price of a commodity on or before a day, where a P line beats an at-price on the same day. */
const priceOn = (ledgerId: string, commodity: SQL, day: SQL) => sql`
	select price_amount as amount, price_commodity as currency
	from ${priceTable}
	where ledger_id = ${ledgerId} and commodity = ${commodity} and date <= ${day}
	order by date desc, source = ${PriceSource.Line} desc, line desc
	limit 1
`;

export type LotHistory = {
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	origin: LotOrigin;
	from: string | null;
	units: Amount;
	remaining: Amount;
	cost: Quantity;
	disposals: {
		location: RupeeParseLocation;
		date: Temporal.PlainDate;
		kind: DisposalKind;
		units: Amount;
		price: Quantity | null;
		gain: Quantity | null;
	}[];
};

type LotsInOptions = { account: string; commodity: string };

const sourceLot = alias(lotTable, 'source_lot');

const lotsIn =
	(ledgerId: string) =>
	(options: LotsInOptions): ResultAsync<LotHistory[]> =>
		withContext('db')((db) =>
			attempt(async () => {
				const inHolding = and(
					eq(lotTable.ledgerId, ledgerId),
					eq(lotTable.account, options.account),
					eq(lotTable.commodity, options.commodity),
				);

				const lots = await db
					.select({
						id: lotTable.id,
						file: ledgerFiles.key,
						line: transactionTable.line,
						date: lotTable.date,
						origin: lotTable.origin,
						from: sourceLot.account,
						units: lotTable.units,
						remaining: lotTable.remaining,
						costAmount: lotTable.costAmount,
						costCommodity: lotTable.costCommodity,
					})
					.from(lotTable)
					.innerJoin(postings, eq(postings.id, lotTable.postingId))
					.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
					.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
					.leftJoin(sourceLot, eq(sourceLot.id, lotTable.sourceId))
					.where(inHolding)
					.orderBy(asc(lotTable.date), ...LEDGER_ORDER.slice(2));
				const disposals = await db
					.select({
						lot: lotTable.id,
						file: ledgerFiles.key,
						line: transactionTable.line,
						date: transactionTable.date,
						kind: disposalTable.kind,
						units: disposalTable.units,
						priceAmount: disposalTable.priceAmount,
						priceCommodity: disposalTable.priceCommodity,
					})
					.from(disposalTable)
					.innerJoin(lotTable, eq(lotTable.id, disposalTable.lotId))
					.innerJoin(postings, eq(postings.id, disposalTable.postingId))
					.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
					.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
					.where(inHolding)
					.orderBy(...LEDGER_ORDER);

				const byLot = Object.groupBy(disposals, (d) => d.lot);
				return lots.map((lot) => ({
					location: { file: lot.file, line: lot.line },
					date: Temporal.PlainDate.from(lot.date),
					origin: lot.origin,
					from: lot.from,
					units: lot.units as Amount,
					remaining: lot.remaining as Amount,
					cost: { amount: lot.costAmount as Amount, commodity: lot.costCommodity },
					disposals: (byLot[lot.id] ?? []).map((disposal) => {
						const units = disposal.units as Amount;
						const price = toQuantity({
							amount: disposal.priceAmount,
							commodity: disposal.priceCommodity,
						});
						const cost = { amount: lot.costAmount as Amount, commodity: lot.costCommodity };

						return {
							location: { file: disposal.file, line: disposal.line },
							date: Temporal.PlainDate.from(disposal.date),
							kind: disposal.kind,
							units,
							price,
							gain: realised(units, price, cost),
						};
					}),
				}));
			}),
		);

const unembedded =
	(ledgerId: string) =>
	(model: string, limit: number): ResultAsync<Unembedded[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.select({ id: transactionTable.id, description: transactionTable.description })
					.from(transactionTable)
					.where(
						and(
							eq(transactionTable.ledgerId, ledgerId),
							sql`${transactionTable.embeddingModel} is distinct from ${model}`,
						),
					)
					.orderBy(desc(transactionTable.date))
					.limit(limit),
			),
		);

const fillChunk = (ledgerId: string, model: string, rows: Filled[]) => sql`
	update ${transactionTable} t
	set embedding = f.embedding::vector, embedding_model = ${model}
	from unnest(
		${sql.param(rows.map((r) => r.id))}::uuid[],
		${sql.param(rows.map((r) => (r.vector ? vectorText(r.vector) : null)))}::text[]
	) as f(id, embedding)
	where t.id = f.id and t.ledger_id = ${ledgerId}
`;

const fill =
	(ledgerId: string) =>
	(model: string, rows: Filled[]): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction((t) =>
					inOrder(statementChunks(rows).map((c) => () => t.execute(fillChunk(ledgerId, model, c)))),
				),
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

/** Of these checksums, those a file's metadata cites, unlocked or as uploaded. */
const cited =
	(ledgerId: string) =>
	(checksums: string[]): ResultAsync<string[]> =>
		withContext('db')((db) =>
			attempt(() =>
				db
					.selectDistinct({ value: metadataTable.value })
					.from(metadataTable)
					.where(
						and(
							eq(metadataTable.ledgerId, ledgerId),
							inArray(metadataTable.key, ['checksum', 'original-checksum']),
							inArray(metadataTable.value, checksums),
							isNotNull(metadataTable.fileId),
						),
					)
					.then((r) => r.map((c) => c.value)),
			),
		);

export const index = (ledgerId: string) => ({
	files: files(ledgerId),
	cited: cited(ledgerId),
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
	rebook: rebook(ledgerId),
	holdings: holdings(ledgerId),
	latestPrices: latestPrices(ledgerId),
	worth: worth(ledgerId),
	lotsIn: lotsIn(ledgerId),
	unmatched: unmatched(ledgerId),
	transactions: transactions(ledgerId),
	unembedded: unembedded(ledgerId),
	fill: fill(ledgerId),
});

const ledgerColumns = {
	id: ledgers.id,
	handle: ledgers.handle,
	name: ledgers.name,
	owner: ledgers.ownerId,
};

// A user reaches the ledgers they own and those they are a member of.
const reachable = (db: Database, userId: string, where: SQL | undefined) =>
	db
		.select(ledgerColumns)
		.from(ledgers)
		.leftJoin(
			memberships,
			and(eq(memberships.ledgerId, ledgers.id), eq(memberships.userId, userId)),
		)
		.where(and(where, or(eq(ledgers.ownerId, userId), isNotNull(memberships.id))))
		.orderBy(asc(ledgers.createdAt));

export const findLedger = (userId: string, handle: string): ResultAsync<Ledger> =>
	withContext('db')((db) =>
		attempt(() => reachable(db, userId, eq(ledgers.handle, handle)).limit(1)).andThen(([f]) =>
			f ? ok(f) : err(fault('LedgerNotFound', { handle })),
		),
	);

export const findLedgers = (u: string): ResultAsync<Ledger[]> =>
	withContext('db')((db) => attempt(() => reachable(db, u, undefined)));

type InsertLedgerOptions = {
	owner: string;
	handle: string;
	name: string;
};

export const insertLedger = (options: InsertLedgerOptions): ResultAsync<Ledger> => {
	const { owner, handle, name } = options;
	return withContext('db')((db) =>
		attemptWrite(() =>
			db
				.insert(ledgers)
				.values({ ownerId: owner, handle, name })
				.returning({ id: ledgers.id })
				.then(([i]) => i ?? Promise.reject(new Error(`${handle} was not saved`)))
				.then((i) => ({ id: i.id, handle, name, owner })),
		).mapErr((e) =>
			violates(e, 'ledgers_handle_unique') ? fault('NameTaken', { name: handle }) : e,
		),
	);
};
