import { anyOf, noneOf } from '#lib/server/db/expressions.ts';
import { ROWS_PER_STATEMENT, type Database } from '#lib/server/db/index.ts';
import { insertAll } from '#lib/server/db/insert.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { byCodeUnit } from '#lib/server/shared/text.ts';
import type { Span } from '#lib/shared/dates.ts';
import { sql, type SqlBool } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { CURRENCIES } from '../domain/lots';
import { displayLocation } from '../domain/parser';
import { marketPrices } from '../domain/prices';
import { INDEXER } from '../domain/sync';
import { accountType, BALANCE_TYPES, parentsOf } from '../domain/taxonomy';
import {
	Feed,
	ProblemKind,
	type RupeaLedgerFile,
	type RupeaMetadata,
	type RupeaTransaction,
} from '../domain/types';
import { toSpans } from './database-queries';

export type IndexedFile = { key: string; version: string; indexer: number };

export const listIndexedFiles = (ledgerId: string): ResultAsync<IndexedFile[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('ledgerFiles')
				.select(['ledgerFiles.key', 'ledgerFiles.version', 'ledgerFiles.indexer'])
				.where('ledgerFiles.ledgerId', '=', ledgerId)
				.execute(),
		),
	);

/** Of these checksums, those in a file's metadata, unlocked or as uploaded, with each file that cites one. */
export const findImported = (
	ledgerId: string,
	checksums: string[],
): ResultAsync<{ checksum: string; file: string }[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('metadata')
				.innerJoin('ledgerFiles', 'ledgerFiles.id', 'metadata.fileId')
				.select(['metadata.value as checksum', 'ledgerFiles.key as file'])
				.distinct()
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', ['checksum', 'original-checksum'])
				.where((e) => anyOf(e.ref('metadata.value'), checksums, 'text'))
				.execute(),
		),
	);

/** The counted file holding an account's latest posting, if any. */
export const findLatestFile = (ledgerId: string, account: string): ResultAsync<string | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('postings')
				.innerJoin('accounts', 'accounts.id', 'postings.accountId')
				.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
				.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
				.select('ledgerFiles.key')
				.where('postings.ledgerId', '=', ledgerId)
				.where(sql<SqlBool>`lower(accounts.name) = lower(${account})`)
				.orderBy('postings.date', 'desc')
				.limit(1)
				.executeTakeFirst(),
		).map((r) => r?.key ?? null),
	);

type IndexFileOptions = {
	key: string;
	version: string;
	file: RupeaLedgerFile;
	failed: RupeaError[];
};

/** What changing a file touched: the commodities whose lots it held before or holds now, and the days its transactions span. */
export type Touched = { commodities: string[]; spans: Span[] };

/** Replaces what a file indexes and what failed to parse in it, each transaction keeping its id where it can and each description its embedding, so saving a file neither moves a page nor re-embeds it. */
export const indexFile = (
	ledgerId: string,
	{ key, version, file, failed }: IndexFileOptions,
): ResultAsync<Touched> => {
	const untyped = untypedAccount(file);
	if (untyped) return errAsync(untyped);

	return atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const fileId = await saveVersion(tx, { ledgerId, key, version });
				const old = await oldTransactions(tx, fileId);
				const rows = rowsOf({ ledgerId, fileId, file, idOf: idsFrom(old) });
				const kept = new Set(rows.transactions.map((t) => t.id));
				const unmatched = old.map((o) => o.id).filter((id) => !kept.has(id));
				const postings = await withAccounts(tx, ledgerId, rows.postings);
				const prices = await withSymbols(tx, { feed: Feed.Ledger, ledgerId }, rows.prices);
				const links = await withFeedSymbols(tx, rows.links);
				const problems = failed.map((e) => ({
					ledgerId,
					fileId,
					kind: ProblemKind.Parse,
					error: e,
				}));

				const lotsBefore = await lotCommoditiesOf(tx, fileId);
				const spansBefore = await spansOf(tx, fileId);

				await tx.deleteFrom('metadata').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('prices').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('symbolLinks').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('problems').where('fileId', '=', fileId).execute();
				await deleteOwnedBy(tx, fileId);

				await saveTransactions(tx, rows.transactions);
				await replaceOldTransactions(tx, fileId, unmatched);
				await insertAll(tx, 'postings', postings);
				await insertAll(tx, 'prices', prices);
				await insertAll(tx, 'symbolLinks', links);
				await insertAll(tx, 'metadata', rows.metadata);
				await insertAll(tx, 'problems', problems);

				const lotsAfter = await lotCommoditiesOf(tx, fileId);
				const spansAfter = await spansOf(tx, fileId);
				return {
					commodities: [...lotsBefore, ...lotsAfter],
					spans: [...spansBefore, ...spansAfter],
				};
			}),
		),
	);
};

export const unindexFile = (ledgerId: string, key: string): ResultAsync<Touched> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const file = await tx
					.selectFrom('ledgerFiles')
					.select('ledgerFiles.id')
					.where('ledgerFiles.ledgerId', '=', ledgerId)
					.where('ledgerFiles.key', '=', key)
					.executeTakeFirst();
				if (!file) return { commodities: [], spans: [] };

				const commodities = await lotCommoditiesOf(tx, file.id);
				const spans = await spansOf(tx, file.id);
				await tx.deleteFrom('ledgerFiles').where('id', '=', file.id).execute();
				return { commodities, spans };
			}),
		),
	);

/** A key spans no days, so a rename touches only the commodities whose lots the file holds. */
export const renameIndexedFile = (
	ledgerId: string,
	from: string,
	to: string,
): ResultAsync<Touched> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.updateTable('ledgerFiles')
				.set({ key: to })
				.where('ledgerId', '=', ledgerId)
				.where('key', '=', from)
				.returning('id')
				.executeTakeFirst()
				.then((f) => (f ? lotCommoditiesOf(db, f.id) : []))
				.then((c) => ({ commodities: c, spans: [] })),
		),
	);

/** The parser already refuses these; checked again so no posting goes unindexed. */
const untypedAccount = (file: RupeaLedgerFile): RupeaError | null =>
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

type VersionOptions = { ledgerId: string; key: string; version: string };

const saveVersion = (db: Database, { ledgerId, key, version }: VersionOptions) =>
	db
		.insertInto('ledgerFiles')
		.values({ ledgerId, key, version, indexer: INDEXER })
		.onConflict((o) => o.columns(['ledgerId', 'key']).doUpdateSet({ version, indexer: INDEXER }))
		.returning('id')
		.executeTakeFirstOrThrow()
		.then((f) => f.id);

type OldTransaction = {
	id: string;
	date: string;
	time: string | null;
	description: string;
};

const oldTransactions = (db: Database, fileId: string): Promise<OldTransaction[]> =>
	db
		.selectFrom('transactions')
		.select(['id', 'date', 'time', 'description'])
		.where('fileId', '=', fileId)
		.orderBy('line')
		.execute();

/** Hands out old ids by date, time and description, in file order, so an edit or a line added above keeps them; a new id otherwise. */
const idsFrom = (old: OldTransaction[]) => {
	const free = Object.groupBy(old, (o) => `${o.date} ${o.time} ${o.description}`);

	return (t: RupeaTransaction) =>
		free[`${t.date} ${t.time ?? null} ${t.description}`]?.shift()?.id ?? uuidv7();
};

/** A kept transaction gets its postings and metadata anew, as a deleted one loses them by cascade. */
const deleteOwnedBy = async (db: Database, fileId: string) => {
	const owners = db.selectFrom('transactions').select('id').where('fileId', '=', fileId);

	await db.deleteFrom('metadata').where('transactionId', 'in', owners).execute();
	await db.deleteFrom('postings').where('transactionId', 'in', owners).execute();
};

type TransactionRow = {
	id: string;
	ledgerId: string;
	fileId: string;
	line: number;
	date: string;
	time: string | null;
	description: string;
	comment: string | null;
};

/** A kept transaction counts again until files settle, as a new one does, and keeps its embedding. */
const saveTransactions = async (db: Database, rows: TransactionRow[]) => {
	for (const chunk of chunks(rows, ROWS_PER_STATEMENT))
		await db // NOSONAR -- a transaction's statements share one connection, so they run in turn
			.insertInto('transactions')
			.values(chunk)
			.onConflict((o) =>
				o.column('id').doUpdateSet((e) => ({
					line: e.ref('excluded.line'),
					comment: e.ref('excluded.comment'),
					counted: true,
				})),
			)
			.execute();
};

type RowsOptions = {
	ledgerId: string;
	fileId: string;
	file: RupeaLedgerFile;
	idOf: (t: RupeaTransaction) => string;
};

/** Each table's rows for a parsed file, its prices and links still to be put on their symbols. */
const rowsOf = ({ ledgerId, fileId, file, idOf }: RowsOptions) => {
	const indexed = file.transactions.map((t) => ({
		id: idOf(t),
		transaction: t,
		postings: t.postings.map((p) => ({ id: uuidv7(), posting: p })),
	}));

	const transactions = indexed.map(({ id, transaction }) => ({
		id,
		ledgerId,
		fileId,
		line: transaction.location.line,
		date: transaction.date.toString(),
		time: transaction.time?.toString() ?? null,
		description: transaction.description,
		comment: transaction.comment,
	}));
	const postings = indexed.flatMap(({ id, transaction, postings: p }) =>
		p.flatMap(({ id: postingId, posting }, position) => {
			const type = accountType(posting.account);
			return type
				? [
						{
							account: posting.account,
							row: {
								id: postingId,
								ledgerId,
								transactionId: id,
								date: transaction.date.toString(),
								position,
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
								comment: posting.comment,
							},
						},
					]
				: [];
		}),
	);
	const prices = marketPrices(file).map((p) => ({
		symbol: p.commodity,
		row: {
			fileId,
			line: p.location.line,
			date: p.date.toString(),
			priceAmount: p.price.amount,
			priceCommodity: p.price.commodity,
			source: p.source,
		},
	}));
	const links = file.links.map((l) => ({
		feed: l.feed,
		symbol: l.symbol,
		row: {
			ledgerId,
			alias: l.commodity,
			since: l.since?.toString() ?? null,
			fileId,
			line: l.location.line,
		},
	}));
	const metadata = [
		...ownedBy({ ledgerId, fileId }, file.metadata),
		...indexed.flatMap(({ id, transaction }) =>
			ownedBy({ ledgerId, transactionId: id }, transaction.metadata),
		),
		...indexed.flatMap(({ postings: p }) =>
			p.flatMap(({ id, posting }) => ownedBy({ ledgerId, postingId: id }, posting.metadata)),
		),
	];

	return { transactions, postings, prices, links, metadata };
};

/**
 * Deletes a file's transactions that no new row kept, by id, and rows without an embedding take their description's.
 * The select still sees the deleted rows, as Postgres runs a statement on one snapshot, so the update keeps to the others.
 */
const replaceOldTransactions = (db: Database, fileId: string, unmatched: string[]) =>
	db
		.with('deleted', (db) =>
			db
				.deleteFrom('transactions')
				.where((e) => anyOf(e.ref('transactions.id'), unmatched, 'uuid')),
		)
		.with('embedded', (db) =>
			db
				.selectFrom('transactions')
				.select(['description', 'embedding', 'embeddingModel'])
				.distinctOn('description')
				.where('fileId', '=', fileId)
				.where('embedding', 'is not', null),
		)
		.updateTable('transactions')
		.from('embedded')
		.set((e) => ({
			embedding: e.ref('embedded.embedding'),
			embeddingModel: e.ref('embedded.embeddingModel'),
		}))
		.where('transactions.fileId', '=', fileId)
		.where('transactions.embedding', 'is', null)
		.whereRef('transactions.description', '=', 'embedded.description')
		.where((e) => noneOf(e.ref('transactions.id'), unmatched, 'uuid'))
		.execute();

type MetadataOwner = { ledgerId: string } & (
	{ fileId: string } | { transactionId: string } | { postingId: string }
);

const ownedBy = (o: MetadataOwner, m: RupeaMetadata) =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => ({ key, value: v })))
		.map((e, i) => ({ ...o, position: i, ...e }));

/**
 * Puts each row on its ledger's account of that name, whatever its case, made with every account
 * above it the first time it is named. New accounts go in sorted, as symbols do, and each finds its
 * parent by name once all are in.
 */
const withAccounts = async <R>(
	db: Database,
	ledgerId: string,
	rows: { account: string; row: R }[],
) => {
	const named = [...new Set(rows.flatMap((r) => parentsOf(r.account)))].toSorted(byCodeUnit);
	const names = named.filter((n, i) => named.findIndex((m) => same(m, n)) === i);
	const accounts = names.flatMap((n) => {
		const type = accountType(n);
		return type ? [{ ledgerId, name: n, type }] : [];
	});

	if (accounts.length > 0)
		await db
			.insertInto('accounts')
			.values(accounts)
			.onConflict((c) => c.doNothing())
			.execute();
	await db
		.updateTable('accounts as c')
		.from('accounts as p')
		.set((e) => ({ parentId: e.ref('p.id') }))
		.where('c.ledgerId', '=', ledgerId)
		.where('c.parentId', 'is', null)
		.whereRef('p.ledgerId', '=', 'c.ledgerId')
		.where(sql<SqlBool>`position(':' in c.name) > 0`)
		.where(sql<SqlBool>`lower(p.name) = lower(regexp_replace(c.name, ':[^:]*$', ''))`)
		.execute();
	const known = await db
		.selectFrom('accounts')
		.select(['accounts.id', sql<string>`lower(accounts.name)`.as('key')])
		.where('accounts.ledgerId', '=', ledgerId)
		.where((e) =>
			anyOf(
				sql`lower(${e.ref('accounts.name')})`,
				names.map((n) => n.toLowerCase()),
				'text',
			),
		)
		.execute();

	const ids = Object.fromEntries(known.map((k) => [k.key, k.id]));
	return rows.map((r) => ({ ...r.row, accountId: ids[r.account.toLowerCase()] ?? '' }));
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type Owner = { feed: Feed; ledgerId: string | null };

/**
 * Puts each row on its owner's symbol of that name, made the first time it is named. New symbols
 * go in sorted, so two syncs making the same ones take their locks in one order, and one another
 * sync made meanwhile is updated in place so that it is still returned.
 */
const withSymbols = async <R>(db: Database, owner: Owner, rows: { symbol: string; row: R }[]) => {
	const bySymbol = Object.groupBy(rows, (r) => r.symbol);
	const names = Object.keys(bySymbol).toSorted(byCodeUnit);

	const known = names.length
		? await db
				.selectFrom('symbols')
				.select(['symbols.id', 'symbols.symbol'])
				.where('symbols.feed', '=', owner.feed)
				.where('symbols.ledgerId', owner.ledgerId ? '=' : 'is', owner.ledgerId)
				.where('symbols.symbol', 'in', names)
				.execute()
		: [];
	const seen = new Set(known.map((k) => k.symbol));
	const missing = names.filter((n) => !seen.has(n));
	const made = missing.length
		? await db
				.insertInto('symbols')
				.values(missing.map((n) => ({ ...owner, symbol: n })))
				.onConflict((oc) =>
					oc
						.columns(['feed', 'ledgerId', 'symbol'])
						.doUpdateSet((e) => ({ symbol: e.ref('excluded.symbol') })),
				)
				.returning(['symbols.id', 'symbols.symbol'])
				.execute()
		: [];

	return [...known, ...made].flatMap((s) =>
		(bySymbol[s.symbol] ?? []).map((r) => ({ ...r.row, symbolId: s.id })),
	);
};

/** Puts each link on its feed's symbol, which every ledger shares; one feed at a time, in order. */
const withFeedSymbols = async <R>(db: Database, rows: { feed: Feed; symbol: string; row: R }[]) => {
	const byFeed = Object.groupBy(rows, (r) => r.feed);
	const feeds = Object.values(Feed).filter((f) => byFeed[f]);
	const linked = [];
	for (const f of feeds)
		linked.push(...(await withSymbols(db, { feed: f, ledgerId: null }, byFeed[f] ?? [])));
	return linked;
};

const lotCommoditiesOf = (db: Database, fileId: string): Promise<string[]> =>
	db
		.selectFrom('postings')
		.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
		.select('postings.commodity')
		.distinct()
		.where('transactions.fileId', '=', fileId)
		.where('postings.accountType', 'in', BALANCE_TYPES)
		.where((e) => noneOf(e.ref('postings.commodity'), CURRENCIES, 'text'))
		.execute()
		.then((r) => r.map((c) => c.commodity));

const spansOf = (db: Database, fileId: string): Promise<Span[]> =>
	db
		.selectFrom('transactions')
		.select((e) => [
			e.fn.min<string | null>('transactions.date').as('from'),
			e.fn.max<string | null>('transactions.date').as('to'),
		])
		.where('transactions.fileId', '=', fileId)
		.executeTakeFirstOrThrow()
		.then(toSpans);
