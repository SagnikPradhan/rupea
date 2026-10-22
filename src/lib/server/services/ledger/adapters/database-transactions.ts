import { anyOf, distance, noneOf } from '#lib/server/db/expressions.ts';
import { ROWS_PER_STATEMENT, vectorText, type Database } from '#lib/server/db/index.ts';
import { readOnly } from '#lib/server/db/read-only.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { transaction } from '#lib/server/db/transaction.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import type { Amount } from '../domain/amounts';
import { EVENT_KEYS } from '../domain/events';
import { toMetadata } from '../domain/parser';
import type { Neighbour } from '../domain/prediction';
import { CURRENCIES } from '../domain/lots';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { Filled, Unembedded } from '../domain/text';
import type { RupeeMetadata, RupeeTransaction } from '../domain/types';
import type { Touched } from './database-files';
import { before, inAccount, listed, newestFirst, toCost, toPrice } from './database-queries';

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
			readWhere(ledgerId, (e) => e('transactions.id', 'in', c)),
		),
	).map((r) => r.flat());

export const listTransactions = (
	ledgerId: string,
	{ filter, after, limit }: PageOptions<Cursor>,
): ResultAsync<Page<CountedTransaction, Cursor>> =>
	readOnly(async (db) => {
		const keys = await db
			.selectFrom('transactions as t')
			.select(['t.id', 't.date', 't.sortTime as time', 't.counted'])
			.where((e) =>
				e.and([
					listed(ledgerId, filter)(e),
					...(filter.account === null ? [] : [hasPostingIn(filter.account)(e)]),
					...(after === null ? [] : [before(after)]),
				]),
			)
			.orderBy(newestFirst)
			.limit(limit)
			.execute();
		const found =
			keys.length === 0
				? []
				: await readIn(db, (eb) =>
						eb(
							'transactions.id',
							'in',
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

/** Marks these transactions uncounted and every other counted, writing only the rows that change, and returns the commodities and lots they post. */
export const recount = (ledgerId: string, uncounted: string[]): ResultAsync<Touched> =>
	withContext('db')((db) =>
		attempt(() =>
			transaction(db, async (tx) => {
				const counting = await tx
					.updateTable('transactions')
					.set({ counted: true })
					.where('ledgerId', '=', ledgerId)
					.where('counted', '=', false)
					.where((e) => noneOf(e.ref('id'), uncounted, 'uuid'))
					.returning('id')
					.execute();
				const uncounting = await tx
					.updateTable('transactions')
					.set({ counted: false })
					.where('ledgerId', '=', ledgerId)
					.where('counted', '=', true)
					.where((e) => anyOf(e.ref('id'), uncounted, 'uuid'))
					.returning('id')
					.execute();
				const changed = [...counting, ...uncounting].map((t) => t.id);

				const posted = tx
					.selectFrom('postings')
					.select('commodity')
					.distinct()
					.where((e) => anyOf(e.ref('transactionId'), changed, 'uuid'));
				const commodities = await posted.execute();
				const lots = await posted
					.where('accountType', 'in', BALANCE_TYPES)
					.where((e) => noneOf(e.ref('commodity'), CURRENCIES, 'text'))
					.execute();
				return {
					lots: lots.map((c) => c.commodity),
					commodities: commodities.map((c) => c.commodity),
				};
			}),
		),
	);

export type CandidatePair = { ours: string; theirs: string };

// Same date, amount and balance account, in another file; the other side goes
// through the `(ledger_id, account, commodity, amount)` index.
export const listCandidates = (ledgerId: string, key: string): ResultAsync<CandidatePair[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('ledgerFiles as ourFile')
				.innerJoin('transactions as ourTransaction', 'ourTransaction.fileId', 'ourFile.id')
				.innerJoin('postings as ourPosting', 'ourPosting.transactionId', 'ourTransaction.id')
				.innerJoin('postings as theirPosting', (join) =>
					join
						.on('theirPosting.ledgerId', '=', ledgerId)
						.onRef('theirPosting.account', '=', 'ourPosting.account')
						.onRef('theirPosting.commodity', '=', 'ourPosting.commodity')
						.onRef('theirPosting.amount', '=', 'ourPosting.amount'),
				)
				.innerJoin('transactions as theirTransaction', (join) =>
					join
						.onRef('theirTransaction.id', '=', 'theirPosting.transactionId')
						.onRef('theirTransaction.date', '=', 'ourTransaction.date')
						.onRef('theirTransaction.fileId', '!=', 'ourFile.id'),
				)
				.where('ourFile.ledgerId', '=', ledgerId)
				.where('ourFile.key', '=', key)
				.where('ourPosting.accountType', 'in', BALANCE_TYPES)
				.select(['ourTransaction.id as ours', 'theirTransaction.id as theirs'])
				.distinct()
				.execute(),
		),
	);

// Only transactions in an event, through the metadata `(ledger_id, key, value)` index.
export const listEventTransactions = (ledgerId: string): ResultAsync<IndexedTransaction[]> =>
	readWhere(ledgerId, (eb) =>
		eb(
			'transactions.id',
			'in',
			eb
				.selectFrom('metadata')
				.select('metadata.transactionId')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', EVENT_KEYS),
		),
	);

// Every member of every event a transaction in the file belongs to.
export const listEventsInFile = (
	ledgerId: string,
	key: string,
): ResultAsync<IndexedTransaction[]> =>
	readWhere(ledgerId, (eb) =>
		eb(
			'transactions.id',
			'in',
			eb
				.selectFrom('metadata')
				.select('metadata.transactionId')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', EVENT_KEYS)
				.where('metadata.value', 'in', eventsOfFile(eb, ledgerId, key)),
		),
	);

export const listEventMembers = (
	ledgerId: string,
	event: string,
): ResultAsync<IndexedTransaction[]> =>
	readWhere(ledgerId, (eb) =>
		eb(
			'transactions.id',
			'in',
			eb
				.selectFrom('metadata')
				.select('metadata.transactionId')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', EVENT_KEYS)
				.where('metadata.value', '=', event),
		),
	);

export const isEventIdTaken = (ledgerId: string, id: string): ResultAsync<boolean> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('metadata')
				.select('metadata.id')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', EVENT_KEYS)
				.where('metadata.value', '=', id)
				.limit(1)
				.executeTakeFirst(),
		).map((r) => r !== undefined),
	);

export const listUnembedded = (
	ledgerId: string,
	model: string,
	limit: number,
): ResultAsync<Unembedded[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('transactions')
				.select(['transactions.id', 'transactions.description'])
				.where('transactions.ledgerId', '=', ledgerId)
				.where('transactions.embeddingModel', 'is distinct from', model)
				.orderBy('transactions.date', 'desc')
				.limit(limit)
				.execute(),
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
			transaction(db, async (tx) => {
				for (const chunk of chunks(rows, ROWS_PER_STATEMENT))
					await embeddingsUpdate(tx, ledgerId, model, chunk).execute();
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
			transaction(db, async (tx) => {
				await sql`set local hnsw.iterative_scan = relaxed_order`.execute(tx);
				await sql.raw(`set local hnsw.ef_search = ${SEARCHED}`).execute(tx);
				return nearestQuery(tx, ledgerId, model, vectors).execute();
			}),
		).map((r) => byQuery(vectors.length, r)),
	);
};

const hasPostingIn =
	(a: string) => (e: ExpressionBuilder<Tables & { t: Tables['transactions'] }, 't'>) =>
		e.exists(
			e
				.selectFrom('postings as p')
				.select(sql.lit(1).as('one'))
				.whereRef('p.transactionId', '=', 't.id')
				.where(inAccount(a)),
		);

// The event ids the file's transactions name, through the metadata index.
const eventsOfFile = (
	eb: ExpressionBuilder<Tables, 'transactions'>,
	ledgerId: string,
	key: string,
) =>
	eb
		.selectFrom('metadata')
		.innerJoin('transactions', 'transactions.id', 'metadata.transactionId')
		.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
		.select('metadata.value')
		.where('metadata.ledgerId', '=', ledgerId)
		.where('ledgerFiles.key', '=', key)
		.where('metadata.key', 'in', EVENT_KEYS);

type Where = (eb: ExpressionBuilder<Tables, 'transactions'>) => Expression<SqlBool>;

// `n` narrows the ledger's transactions. One snapshot, so the metadata
// read always belongs to the transactions read.
const readWhere = (l: string, n: Where): ResultAsync<IndexedTransaction[]> =>
	readOnly((t) => readIn(t, (e) => e.and([e('transactions.ledgerId', '=', l), n(e)])));

const readIn = async (db: Database, where: Where): Promise<IndexedTransaction[]> => {
	const rows = await db
		.selectFrom('transactions')
		.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
		.leftJoin('postings', 'postings.transactionId', 'transactions.id')
		.select([
			'ledgerFiles.key',
			'transactions.id',
			'transactions.line',
			'transactions.date',
			'transactions.time',
			'transactions.description',
			'postings.id as postingId',
			'postings.account',
			'postings.amount',
			'postings.commodity',
			'postings.priceAmount',
			'postings.priceCommodity',
			'postings.priceKind',
			'postings.costAmount',
			'postings.costCommodity',
			'postings.costDate',
			'postings.balance',
		])
		.where(where)
		.orderBy('transactions.id')
		.orderBy('postings.position')
		.execute();

	// A transaction's statements share one connection, so they go one at a time.
	const ofTransactions = await db
		.selectFrom('metadata')
		.innerJoin('transactions', 'transactions.id', 'metadata.transactionId')
		.select(['metadata.transactionId as owner', 'metadata.key', 'metadata.value'])
		.where(where)
		.orderBy('metadata.position')
		.execute();
	const ofPostings = await db
		.selectFrom('metadata')
		.innerJoin('postings', 'postings.id', 'metadata.postingId')
		.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
		.select(['metadata.postingId as owner', 'metadata.key', 'metadata.value'])
		.where(where)
		.orderBy('metadata.position')
		.execute();
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

const embeddingsUpdate = (tx: Database, ledgerId: string, model: string, rows: Filled[]) =>
	tx
		.updateTable('transactions')
		.set({
			embedding: sql<number[]>`${sql.ref('f.embedding')}::vector`,
			embeddingModel: model,
		})
		.from(
			sql<{ id: string; embedding: string | null }>`(
				select * from unnest(
					${rows.map((r) => r.id)}::uuid[],
					${rows.map((r) => (r.vector ? vectorText(r.vector) : null))}::text[]
				) as x(id, embedding)
			)`.as('f'),
		)
		.whereRef('transactions.id', '=', 'f.id')
		.where('transactions.ledgerId', '=', ledgerId);

type NeighbourRow = {
	query: string;
	account: string;
	amount: bigint;
	date: string;
	similarity: number;
};

// Nearest by cosine distance for each vector in turn, the index finding them.
const nearestQuery = (tx: Database, ledgerId: string, model: string, vectors: Float32Array[]) =>
	tx
		.selectFrom(
			sql<{ v: string; i: number }>`(
				select v, i from unnest(${vectors.map(vectorText)}::text[]::vector[]) with ordinality as x(v, i)
			)`.as('q'),
		)
		.innerJoinLateral(
			(e) =>
				e
					.selectFrom('transactions')
					.select((x) => [
						'transactions.id',
						'transactions.date',
						sql<number>`1 - (${distance(x.ref('transactions.embedding'), x.ref('q.v'))})`.as(
							'similarity',
						),
					])
					.where('transactions.ledgerId', '=', ledgerId)
					.where('transactions.embeddingModel', '=', model)
					.where('transactions.embedding', 'is not', null)
					.orderBy((x) => distance(x.ref('transactions.embedding'), x.ref('q.v')))
					.limit(NEAREST)
					.as('n'),
			(j) => j.onTrue(),
		)
		.innerJoin('postings', 'postings.transactionId', 'n.id')
		.select([
			sql<string>`${sql.ref('q.i')}::text`.as('query'),
			'postings.account',
			'postings.amount',
			'n.date',
			'n.similarity',
		]);

// `query` counts from 1, as `with ordinality` does.
const byQuery = (count: number, rows: NeighbourRow[]): Neighbour[][] => {
	const grouped = Object.groupBy(rows, (r) => r.query);
	return Array.from({ length: count }, (_, i) =>
		(grouped[String(i + 1)] ?? []).map((r) => ({
			account: r.account,
			amount: r.amount as Amount,
			date: Temporal.PlainDate.from(r.date),
			similarity: r.similarity,
		})),
	);
};
