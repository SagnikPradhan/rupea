import { anyOf } from '#lib/server/db/expressions.ts';
import { type Database } from '#lib/server/db/index.ts';
import { type UnchangedEntry } from '../domain/parser';
import { PriceSource, type RupeaTransaction } from '../domain/types';

export type OldTransaction = {
	id: string;
	date: string;
	time: string | null;
	description: string;
	line: number;
	comment: string | null;
	counted: boolean;
	hash: string | null;
};

export const oldTransactions = (db: Database, fileId: string): Promise<OldTransaction[]> =>
	db
		.selectFrom('transactions')
		.select(['id', 'date', 'time', 'description', 'line', 'comment', 'counted', 'hash'])
		.where('fileId', '=', fileId)
		.orderBy('line')
		.execute();

export const notAmong = (old: OldTransaction[], rows: { id: string }[]) => {
	const ids = new Set(rows.map((t) => t.id));

	return old.filter((o) => !ids.has(o.id));
};

/** Hands out old transactions by date, time and description, in file order, so an edit or a line added above keeps them. */
export const matchesFrom = (old: OldTransaction[]) => {
	const free = Object.groupBy(old, (o) => `${o.date} ${o.time} ${o.description}`);

	return (t: RupeaTransaction) => free[`${t.date} ${t.time ?? null} ${t.description}`]?.shift();
};

type PostingHeld = {
	id: string;
	transactionId: string;
	position: number;
	accountId: string;
	amount: bigint;
	commodity: string;
	priceAmount: bigint | null;
	priceCommodity: string | null;
	priceKind: string | null;
	costAmount: bigint | null;
	costCommodity: string | null;
	costDate: string | null;
	balance: bigint | null;
	comment: string | null;
};

type MetadataHeld = {
	transactionId?: string | null;
	postingId?: string | null;
	position: number;
	key: string;
	value: string;
};

/** Each transaction's fingerprint: what it holds beyond its own row, its postings and all their metadata, as text to compare. */
const fingerprintsOf = (postings: PostingHeld[], metadata: MetadataHeld[]) => {
	const entries = (rows: MetadataHeld[] = []) => rows.map((m) => [m.position, m.key, m.value]);
	const byTransaction = Object.groupBy(postings, (p) => p.transactionId);
	const onTransaction = Object.groupBy(metadata, (m) => m.transactionId ?? '');
	const onPosting = Object.groupBy(metadata, (m) => m.postingId ?? '');

	return (id: string) =>
		JSON.stringify(
			[
				entries(onTransaction[id]),
				(byTransaction[id] ?? []).map((p) => [
					p.position,
					p.accountId,
					p.amount,
					p.commodity,
					p.priceAmount,
					p.priceCommodity,
					p.priceKind,
					p.costAmount,
					p.costCommodity,
					p.costDate,
					p.balance,
					p.comment,
					entries(onPosting[p.id]),
				]),
			],
			(_, v) => (typeof v === 'bigint' ? v.toString() : v),
		);
};

export const fingerprintsIn = async (db: Database, ids: string[]) => {
	const owned = db
		.selectFrom('postings')
		.select('id')
		.where((e) => anyOf(e.ref('transactionId'), ids, 'uuid'));

	const postings = await db
		.selectFrom('postings')
		.select([
			'id',
			'transactionId',
			'position',
			'accountId',
			'amount',
			'commodity',
			'priceAmount',
			'priceCommodity',
			'priceKind',
			'costAmount',
			'costCommodity',
			'costDate',
			'balance',
			'comment',
		])
		.where((e) => anyOf(e.ref('transactionId'), ids, 'uuid'))
		.orderBy('position')
		.execute();
	const onTransactions = await db
		.selectFrom('metadata')
		.select(['transactionId', 'postingId', 'position', 'key', 'value'])
		.where((e) => anyOf(e.ref('transactionId').$notNull(), ids, 'uuid'))
		.orderBy('position')
		.execute();
	const onPostings = await db
		.selectFrom('metadata')
		.select(['transactionId', 'postingId', 'position', 'key', 'value'])
		.where('postingId', 'in', owned)
		.orderBy('position')
		.execute();

	return fingerprintsOf(postings, [...onTransactions, ...onPostings]);
};

type PriceHeld = {
	symbolId: string;
	line: number | null;
	date: string;
	priceAmount: bigint;
	priceCommodity: string;
	source: string;
};

export const oldPrices = (db: Database, fileId: string) =>
	db
		.selectFrom('prices')
		.select(['id', 'symbolId', 'line', 'date', 'priceAmount', 'priceCommodity', 'source'])
		.where('fileId', '=', fileId)
		.execute();

const priceKey = (p: PriceHeld) =>
	`${p.symbolId} ${p.line} ${p.date} ${p.priceAmount} ${p.priceCommodity} ${p.source}`;

type UnchangedPricesOptions = {
	fileId: string;
	prices: {
		symbolId: string;
		line: number | null;
		date: string;
		priceAmount: bigint;
		priceCommodity: string;
		source: PriceSource;
	}[];
	old: OldTransaction[];
	unchangedRows: TransactionRow[];
};

/** The posting prices of unchanged transactions, which no parse found, on the lines those are on now. */
export const pricesOfUnchanged = ({
	fileId,
	prices,
	old,
	unchangedRows,
}: UnchangedPricesOptions) => {
	const oldLines = Object.fromEntries(old.map((o) => [o.id, o.line]));
	const lines = Object.fromEntries(unchangedRows.map((t) => [oldLines[t.id] ?? 0, t.line]));

	return prices.flatMap((p) => {
		const line = p.source === PriceSource.Posting ? lines[p.line ?? 0] : undefined;
		if (line === undefined) return [];

		return [
			{
				fileId,
				line,
				symbolId: p.symbolId,
				date: p.date,
				priceAmount: p.priceAmount,
				priceCommodity: p.priceCommodity,
				source: p.source,
			},
		];
	});
};

/** Of a file's prices, those to delete and those to add; all of them when an older indexer read it. */
export const priceChangesFrom = <P extends PriceHeld>(
	old: (PriceHeld & { id: string })[],
	prices: P[],
	sameIndexer: boolean,
) => {
	if (!sameIndexer) return { stale: old.map((o) => o.id), added: prices };

	const free = Object.groupBy(old, priceKey);
	const added = prices.filter((p) => !free[priceKey(p)]?.shift());

	return { stale: Object.values(free).flatMap((g) => (g ?? []).map((o) => o.id)), added };
};

type ChangesOptions<P, M> = {
	old: OldTransaction[];
	fingerprintBefore: (id: string) => string;
	unchanged: TransactionRow[];
	read: TransactionRow[];
	postings: P[];
	metadata: M[];
};

/** Of a file's rows, only those to write: a transaction's own when new, on another line or read from other lines, and what it holds when that differs. Moved are those whose order changed, which lots and assertions depend on. */
export const changesFrom = <P extends PostingHeld, M extends MetadataHeld>({
	old,
	fingerprintBefore,
	unchanged,
	read,
	postings,
	metadata,
}: ChangesOptions<P, M>) => {
	const fingerprintNow = fingerprintsOf(postings, metadata);
	const before = Object.fromEntries(old.map((o) => [o.id, o]));

	const transactions = [...unchanged, ...read].toSorted((a, b) => a.line - b.line);

	const added = read.filter((t) => !before[t.id]).map((t) => t.id);
	const stale = read
		.filter((t) => before[t.id] && fingerprintBefore(t.id) !== fingerprintNow(t.id))
		.map((t) => t.id);
	const rewritten = new Set([...added, ...stale]);
	const written = postings.filter((p) => rewritten.has(p.transactionId));
	const posted = new Set(written.map((p) => p.id));
	const existing = transactions.filter((t) => before[t.id]);
	const existingIds = new Set(existing.map((t) => t.id));
	const existingBefore = old.filter((o) => existingIds.has(o.id));

	return {
		added,
		stale,
		moved: existing.filter((t, i) => existingBefore[i]?.id !== t.id).map((t) => t.id),
		transactions: transactions.filter((t) => {
			const o = before[t.id];
			return !o || o.line !== t.line || o.comment !== t.comment || o.hash !== t.hash;
		}),
		postings: written,
		metadata: metadata.filter((m) => {
			if (m.postingId) return posted.has(m.postingId);
			if (m.transactionId) return rewritten.has(m.transactionId);
			return true;
		}),
	};
};

export type TransactionRow = {
	id: string;
	ledgerId: string;
	fileId: string;
	line: number;
	date: string;
	time: string | null;
	description: string;
	comment: string | null;
	counted: boolean;
	hash: string | null;
};

type UnchangedOptions = {
	ledgerId: string;
	fileId: string;
	old: OldTransaction[];
	unchanged: UnchangedEntry[];
};

/** The old row of each unchanged transaction, on the line it is on now; rows of one hash go in file order. */
export const rowsOfUnchanged = ({
	ledgerId,
	fileId,
	old,
	unchanged,
}: UnchangedOptions): TransactionRow[] => {
	const free = Object.groupBy(old, (o) => o.hash ?? '');

	return unchanged.flatMap(({ hash, line }) => {
		const o = free[hash]?.shift();
		return o ? [{ ...o, ledgerId, fileId, line }] : [];
	});
};
