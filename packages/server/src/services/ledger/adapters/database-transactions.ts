import { anyOf, before, distance, noneOf } from '#lib/server/db/expressions.ts';
import { ROWS_PER_STATEMENT, vectorText, type Database } from '#lib/server/db/index.ts';
import { readOnly } from '#lib/server/db/read-only.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { UNSETTLED } from '@rupea/shared/account-tree.ts';
import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import type { Amount } from '../domain/amounts';
import { GROUP_KEYS } from '../domain/groups';
import { toMetadata } from '../domain/nodes';
import type { Neighbour } from '../domain/prediction';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { Filled, Unembedded } from '../domain/text';
import type { RupeaMetadata, RupeaTransaction } from '../domain/types';
import { touchedBy, type Touched } from './database-files';
import {
	listedIn,
	listingKey,
	newestFirst,
	toCost,
	toPrice,
	underAccount,
} from './database-queries';

// Transactions searched near each line; the domain keeps the best few postings.
const NEAREST = 50;

// Candidates the index keeps while searching; at least `NEAREST`.
const SEARCHED = 200;

export type IndexedTransaction = RupeaTransaction & { id: string };

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

export const findFirstDay = (ledgerId: string): ResultAsync<Temporal.PlainDate | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('transactions')
				.select((e) => e.fn.min('transactions.date').as('date'))
				.where('transactions.ledgerId', '=', ledgerId)
				.executeTakeFirst(),
		).map((r) => (r?.date ? Temporal.PlainDate.from(r.date) : null)),
	);

// The cursor compares as one tuple, so a page reads on as one range of the
// order index.
export const listTransactions = (
	ledgerId: string,
	{ filter, after, limit }: PageOptions<Cursor>,
): ResultAsync<Page<CountedTransaction, Cursor>> =>
	readOnly(async (db) => {
		const keys = await db
			.selectFrom('transactions as t')
			.select(['t.id', 't.date', 't.sortTime as time', 't.counted'])
			.where('t.ledgerId', '=', ledgerId)
			.where(listedIn('t', filter))
			.where((e) =>
				filter.account !== null
					? e.exists(
							e
								.selectFrom('postings as p')
								.innerJoin('accounts as a', 'a.id', 'p.accountId')
								.select(sql.lit(1).as('one'))
								.whereRef('p.transactionId', '=', 't.id')
								.where((x) => underAccount(x.ref('a.name'), filter.account)),
						)
					: e.lit(true),
			)
			.where(() => before(listingKey('t'), after && [after.date, after.time, after.id]))
			.orderBy(newestFirst('t'))
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

/**
 * Marks these transactions and their postings uncounted and every other
 * counted, writing only the rows that change, and returns what those rows
 * touch.
 */
export const recount = (ledgerId: string, uncounted: string[]): ResultAsync<Touched> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
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
				if (changed.length === 0)
					return { commodities: [], spans: [], holdings: [], grouped: false };

				await tx
					.updateTable('postings')
					.from('transactions')
					.set((e) => ({ counted: e.ref('transactions.counted') }))
					.whereRef('postings.transactionId', '=', 'transactions.id')
					.where((e) => anyOf(e.ref('transactions.id'), changed, 'uuid'))
					.execute();

				return touchedBy(tx, changed);
			}),
		),
	);

export type CandidatePair = { ours: string; theirs: string };

/** Days either side of a transfer's date that its other half may be booked. */
const TRANSFER_DAYS = 2;

/**
 * Partners kept for each posting, nearest first, so a round amount cannot fan
 * out.
 */
const TRANSFER_PARTNERS = 3;

export const listCandidates = (ledgerId: string, key: string): ResultAsync<CandidatePair[]> => {
	const duplicates = listDuplicates(ledgerId, key);
	const transfers = listTransfers(ledgerId, key);

	return ResultAsync.combine([duplicates, transfers]).map((p) => p.flat());
};

/** Same date, amount and balance account, in another file. */
const listDuplicates = (ledgerId: string, key: string): ResultAsync<CandidatePair[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('ledgerFiles as f')
				.innerJoin('transactions as t', 't.fileId', 'f.id')
				.innerJoin('postings as p', 'p.transactionId', 't.id')
				.innerJoin('postings as q', (j) =>
					j
						.onRef('q.accountId', '=', 'p.accountId')
						.onRef('q.commodity', '=', 'p.commodity')
						.onRef('q.amount', '=', 'p.amount'),
				)
				.innerJoin('transactions as u', (j) =>
					j
						.onRef('u.id', '=', 'q.transactionId')
						.onRef('u.date', '=', 't.date')
						.onRef('u.fileId', '!=', 'f.id'),
				)
				.where('f.ledgerId', '=', ledgerId)
				.where('f.key', '=', key)
				.where('p.accountType', 'in', BALANCE_TYPES)
				.select(['t.id as ours', 'u.id as theirs'])
				.distinct()
				.execute(),
		),
	);

/**
 * The opposite amount on another balance account a few days either side, where
 * each file only knew its own side. Each balance account is looked up through
 * the account, commodity and amount index.
 */
const listTransfers = (ledgerId: string, key: string): ResultAsync<CandidatePair[]> =>
	withContext('db')((db) =>
		attempt(() => {
			const pairs = db
				.selectFrom('ledgerFiles as f')
				.innerJoin('transactions as t', 't.fileId', 'f.id')
				.innerJoin('postings as p', 'p.transactionId', 't.id')
				.innerJoin('accounts as a', (j) =>
					j
						.onRef('a.ledgerId', '=', 'p.ledgerId')
						.onRef('a.id', '!=', 'p.accountId')
						.on('a.type', 'in', BALANCE_TYPES),
				)
				.innerJoin('postings as q', (j) =>
					j
						.onRef('q.accountId', '=', 'a.id')
						.onRef('q.commodity', '=', 'p.commodity')
						.on(sql<SqlBool>`q.amount = -p.amount`)
						.on(
							sql<SqlBool>`q.date between p.date - ${TRANSFER_DAYS}::int and p.date + ${TRANSFER_DAYS}::int`,
						),
				)
				.innerJoin('transactions as u', (j) =>
					j.onRef('u.id', '=', 'q.transactionId').onRef('u.fileId', '!=', 'f.id'),
				)
				.where('f.ledgerId', '=', ledgerId)
				.where('f.key', '=', key)
				.where('p.accountType', 'in', BALANCE_TYPES)
				.where(unsettled('t.id'))
				.where(unsettled('u.id'))
				.select([
					't.id as ours',
					'u.id as theirs',
					sql<number>`row_number() over (partition by p.id order by abs(q.date - p.date), u.id)`.as(
						'rank',
					),
				]);

			return db
				.selectFrom(pairs.as('r'))
				.where('r.rank', '<=', TRANSFER_PARTNERS)
				.select(['r.ours', 'r.theirs'])
				.distinct()
				.execute();
		}),
	);

/** A transaction with a leg on an account still named Unknown or Uncategorized. */
const unsettled = (transaction: string) =>
	sql<SqlBool>`exists (
		select 1 from postings l join accounts n on n.id = l.account_id
		where l.transaction_id = ${sql.ref(transaction)} and n.name ~ ${UNSETTLED.source}
	)`;

// Only transactions in a group, through the metadata `(ledger_id, key, value)` index.
export const listGroupTransactions = (ledgerId: string): ResultAsync<IndexedTransaction[]> =>
	readWhere(ledgerId, (eb) =>
		eb(
			'transactions.id',
			'in',
			eb
				.selectFrom('metadata')
				.select('metadata.transactionId')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', GROUP_KEYS),
		),
	);

// Every member of every group a transaction in the file belongs to.
export const listGroupsInFile = (
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
				.where('metadata.key', 'in', GROUP_KEYS)
				.where('metadata.value', 'in', groupsOfFile(eb, ledgerId, key)),
		),
	);

export const listGroupMembers = (
	ledgerId: string,
	group: string,
): ResultAsync<IndexedTransaction[]> =>
	readWhere(ledgerId, (eb) =>
		eb(
			'transactions.id',
			'in',
			eb
				.selectFrom('metadata')
				.select('metadata.transactionId')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', GROUP_KEYS)
				.where('metadata.value', '=', group),
		),
	);

export const isGroupIdTaken = (ledgerId: string, id: string): ResultAsync<boolean> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('metadata')
				.select('metadata.id')
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', GROUP_KEYS)
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
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
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

	return atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				await sql`set local hnsw.iterative_scan = relaxed_order`.execute(tx);
				await sql.raw(`set local hnsw.ef_search = ${SEARCHED}`).execute(tx);
				return nearestQuery(tx, ledgerId, model, vectors).execute();
			}),
		).map((r) => byQuery(vectors.length, r)),
	);
};

// The group ids the file's transactions name, through the metadata index.
const groupsOfFile = (
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
		.where('metadata.key', 'in', GROUP_KEYS);

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
		.leftJoin('accounts', 'accounts.id', 'postings.accountId')
		.select([
			'ledgerFiles.key',
			'transactions.id',
			'transactions.line',
			'transactions.date',
			'transactions.time',
			'transactions.description',
			'transactions.comment',
			'postings.id as postingId',
			'accounts.name as account',
			'postings.amount',
			'postings.commodity',
			'postings.priceAmount',
			'postings.priceCommodity',
			'postings.priceKind',
			'postings.costAmount',
			'postings.costCommodity',
			'postings.costDate',
			'postings.balance',
			'postings.comment as postingComment',
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
			comment: head.comment,
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
								comment: r.postingComment,
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
const byOwner = (rows: MetadataRow[]): Record<string, RupeaMetadata> =>
	Object.fromEntries(
		Object.entries(Object.groupBy(rows, (r) => r.owner ?? '')).map(([owner, group = []]) => [
			owner,
			toMetadata(group.map((r) => [r.key, r.value])),
		]),
	);

const embeddingsUpdate = (tx: Database, ledgerId: string, model: string, rows: Filled[]) =>
	tx
		.updateTable('transactions')
		.from(
			sql<{ id: string; embedding: string | null }>`(
				select * from unnest(
					${rows.map((r) => r.id)}::uuid[],
					${rows.map((r) => (r.vector ? vectorText(r.vector) : null))}::text[]
				) as x(id, embedding)
			)`.as('f'),
		)
		.set((e) => ({
			embedding: sql<number[]>`${e.ref('f.embedding')}::vector`,
			embeddingModel: model,
		}))
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
			sql<{ v: string; i: string }>`(
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
		.innerJoin('accounts', 'accounts.id', 'postings.accountId')
		.select((e) => [
			e.cast<string>(e.ref('q.i'), 'text').as('query'),
			'accounts.name as account',
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
