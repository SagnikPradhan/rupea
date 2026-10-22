import { ROWS_PER_STATEMENT, vectorText, type Database } from '#lib/server/db/index.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { readOnly } from '#lib/server/db/read-only.ts';
import { attempt, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, asc, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Amount } from '../domain/amounts';
import { EVENT_KEYS } from '../domain/events';
import { toMetadata } from '../domain/parser';
import type { Neighbour } from '../domain/prediction';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { Filled, Unembedded } from '../domain/text';
import type { RupeeMetadata, RupeeTransaction } from '../domain/types';
import {
	ledgerFiles,
	metadata as metadataTable,
	postings,
	transactions as transactionTable,
} from './database-schema';
import {
	before,
	inAccount,
	listed,
	NEWEST_FIRST,
	timeKey,
	toCost,
	toPrice,
} from './database-queries';

// Transactions searched near each line; the domain keeps the best few postings.
const NEAREST = 50;

// Candidates the index keeps while searching; at least `NEAREST`.
const SEARCHED = 200;

export type IndexedTransaction = RupeeTransaction & { id: string };

export type CountedTransaction = IndexedTransaction & { counted: boolean };

/** What a list is narrowed to; a null side is left open. */
export type ListFilter = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account: string | null;
	description: string | null;
};

/** Where a page of transactions starts: just past this one, newest first. */
export type Cursor = { date: string; time: string; id: string };

export type Page<T, C> = { rows: T[]; next: C | null };

export type PageOptions<C> = { filter: ListFilter; after: C | null; limit: number };

export const findTransactions = (
	ledgerId: string,
	ids: string[],
): ResultAsync<IndexedTransaction[]> =>
	ResultAsync.combine(
		chunks(ids, ROWS_PER_STATEMENT).map((c) =>
			readWhere(ledgerId, inArray(transactionTable.id, c)),
		),
	).map((r) => r.flat());

export const listTransactions = (
	ledgerId: string,
	{ filter, after, limit }: PageOptions<Cursor>,
): ResultAsync<Page<CountedTransaction, Cursor>> =>
	readOnly(async (db) => {
		const keys = await db
			.select({
				id: transactionTable.id,
				date: transactionTable.date,
				time: sql<string>`${timeKey}::text`,
				counted: transactionTable.counted,
			})
			.from(transactionTable)
			.where(
				and(
					listed(ledgerId, filter),
					filter.account === null ? undefined : hasPostingIn(filter.account),
					after === null ? undefined : before(after),
				),
			)
			.orderBy(...NEWEST_FIRST)
			.limit(limit);
		const found = await readIn(
			db,
			inArray(
				transactionTable.id,
				keys.map((k) => k.id),
			),
		);

		const byId = Object.fromEntries(found.map((t) => [t.id, t]));
		const last = keys.length === limit ? keys.at(-1) : undefined;
		return {
			rows: keys.flatMap((k) => {
				const transaction = byId[k.id];
				return transaction ? [{ ...transaction, counted: k.counted }] : [];
			}),
			next: last ? { date: last.date, time: last.time, id: last.id } : null,
		};
	});

/** Marks these transactions uncounted and every other counted, writing only the rows that change. */
export const recount = (ledgerId: string, uncounted: string[]): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				await tx
					.update(transactionTable)
					.set({ counted: true })
					.where(
						and(
							eq(transactionTable.ledgerId, ledgerId),
							eq(transactionTable.counted, false),
							sql`${transactionTable.id} <> all(${sql.param(uncounted)}::uuid[])`,
						),
					);
				await tx
					.update(transactionTable)
					.set({ counted: false })
					.where(
						and(
							eq(transactionTable.ledgerId, ledgerId),
							eq(transactionTable.counted, true),
							inArray(transactionTable.id, uncounted),
						),
					);
			}),
		),
	);

export type CandidatePair = { ours: string; theirs: string };

const ourFile = alias(ledgerFiles, 'our_file');
const ourTransaction = alias(transactionTable, 'our_transaction');
const ourPosting = alias(postings, 'our_posting');

const theirTransaction = alias(transactionTable, 'their_transaction');
const theirPosting = alias(postings, 'their_posting');

// Same date, amount and balance account, in another file; the other side goes
// through the `(ledger_id, account, commodity, amount)` index.
export const listCandidates = (ledgerId: string, key: string): ResultAsync<CandidatePair[]> =>
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

// Only transactions in an event, through the metadata `(ledger_id, key, value)` index.
export const listEventTransactions = (ledgerId: string): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		readWhere(
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

// Every member of every event a transaction in the file belongs to.
export const listEventsInFile = (
	ledgerId: string,
	key: string,
): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		readWhere(
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

export const listEventMembers = (
	ledgerId: string,
	event: string,
): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		readWhere(
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

export const isEventIdTaken = (ledgerId: string, id: string): ResultAsync<boolean> =>
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

export const listUnembedded = (
	ledgerId: string,
	model: string,
	limit: number,
): ResultAsync<Unembedded[]> =>
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

// A transaction's statements share one connection, so they go one at a time.
export const saveEmbeddings = (
	ledgerId: string,
	model: string,
	rows: Filled[],
): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				for (const chunk of chunks(rows, ROWS_PER_STATEMENT))
					await tx.execute(embeddingsUpdate(ledgerId, model, chunk));
			}),
		),
	);

// The index covers every ledger, so it keeps scanning until enough rows are
// this ledger's; relaxed order is fine, as the domain sorts them again.
export const findNearest = (
	ledgerId: string,
	model: string,
	vectors: Float32Array[],
): ResultAsync<Neighbour[][]> => {
	if (vectors.length === 0) return okAsync([]);

	return withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
				await tx.execute(sql.raw(`set local hnsw.ef_search = ${SEARCHED}`));
				return tx.execute<NeighbourRow>(nearestQuery(ledgerId, model, vectors));
			}),
		).map((r) => byQuery(vectors.length, r.rows)),
	);
};

const hasPostingIn = (a: string) =>
	sql`exists (select 1 from ${postings} where ${postings.transactionId} = ${transactionTable.id} and ${inAccount(a)})`;

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

// `n` narrows the ledger's transactions. One snapshot, so the metadata
// read always belongs to the transactions read.
const readWhere = (l: string, n: SQL | undefined): ResultAsync<IndexedTransaction[]> =>
	readOnly((t) => readIn(t, and(eq(transactionTable.ledgerId, l), n)));

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

	// A transaction's statements share one connection, so they go one at a time.
	const ofTransactions = await db
		.select({
			owner: metadataTable.transactionId,
			key: metadataTable.key,
			value: metadataTable.value,
		})
		.from(metadataTable)
		.innerJoin(transactionTable, eq(transactionTable.id, metadataTable.transactionId))
		.where(where)
		.orderBy(asc(metadataTable.position));
	const ofPostings = await db
		.select({
			owner: metadataTable.postingId,
			key: metadataTable.key,
			value: metadataTable.value,
		})
		.from(metadataTable)
		.innerJoin(postings, eq(postings.id, metadataTable.postingId))
		.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
		.where(where)
		.orderBy(asc(metadataTable.position));
	const owned = byOwner([...ofTransactions, ...ofPostings]);

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

const compareTimes = (a: Temporal.PlainTime | null, b: Temporal.PlainTime | null) =>
	a && b ? Temporal.PlainTime.compare(a, b) : Number(a !== null) - Number(b !== null);

type MetadataRow = { owner: string | null; key: string; value: string };

// Rows come in written order, which `toMetadata` keeps.
const byOwner = (rows: MetadataRow[]): Record<string, RupeeMetadata> =>
	Object.fromEntries(
		Object.entries(Object.groupBy(rows, (r) => r.owner ?? '')).map(([owner, group = []]) => [
			owner,
			toMetadata(group.map((r) => [r.key, r.value])),
		]),
	);

const embeddingsUpdate = (ledgerId: string, model: string, rows: Filled[]) => sql`
	update ${transactionTable} t
	set embedding = f.embedding::vector, embedding_model = ${model}
	from unnest(
		${sql.param(rows.map((r) => r.id))}::uuid[],
		${sql.param(rows.map((r) => (r.vector ? vectorText(r.vector) : null)))}::text[]
	) as f(id, embedding)
	where t.id = f.id and t.ledger_id = ${ledgerId}
`;

type NeighbourRow = {
	query: string;
	account: string;
	amount: string;
	date: string;
	similarity: number;
};

const nearestQuery = (ledgerId: string, model: string, vectors: Float32Array[]) => sql`
	select q.i::text as query, p.account, p.amount::text as amount, n.date::text as date, n.similarity
	from unnest(${sql.param(vectors.map(vectorText))}::text[]::vector[]) with ordinality as q(v, i)
	cross join lateral (
		select t.id, t.date, 1 - (t.embedding <=> q.v) as similarity
		from ${transactionTable} t
		where t.ledger_id = ${ledgerId} and t.embedding_model = ${model} and t.embedding is not null
		order by t.embedding <=> q.v
		limit ${NEAREST}
	) n
	join ${postings} p on p.transaction_id = n.id
`;

// `query` counts from 1, as `with ordinality` does.
const byQuery = (count: number, rows: NeighbourRow[]): Neighbour[][] => {
	const grouped = Object.groupBy(rows, (r) => r.query);
	return Array.from({ length: count }, (_, i) =>
		(grouped[String(i + 1)] ?? []).map((r) => ({
			account: r.account,
			amount: BigInt(r.amount) as Amount,
			date: Temporal.PlainDate.from(r.date),
			similarity: Number(r.similarity),
		})),
	);
};
