import { anyOf, noneOf } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import { insertAll } from '#lib/server/db/insert.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { byCodeUnit } from '#lib/server/shared/text.ts';
import type { Span } from '#lib/shared/dates.ts';
import { v7 as uuidv7 } from 'uuid';
import { CURRENCIES } from '../domain/lots';
import { displayLocation } from '../domain/parser';
import { marketPrices } from '../domain/prices';
import { accountType, BALANCE_TYPES } from '../domain/taxonomy';
import { Feed, type RupeaLedgerFile, type RupeaMetadata } from '../domain/types';
import { toSpans } from './database-queries';

export type FileVersion = { key: string; version: string | null };

export const listIndexedFiles = (ledgerId: string): ResultAsync<FileVersion[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('ledgerFiles')
				.select(['ledgerFiles.key', 'ledgerFiles.version'])
				.where('ledgerFiles.ledgerId', '=', ledgerId)
				.execute(),
		),
	);

/** Of these checksums, those in a file's metadata, unlocked or as uploaded. */
export const findImported = (ledgerId: string, checksums: string[]): ResultAsync<string[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('metadata')
				.select('metadata.value')
				.distinct()
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', ['checksum', 'original-checksum'])
				.where((e) => anyOf(e.ref('metadata.value'), checksums, 'text'))
				.where('metadata.fileId', 'is not', null)
				.execute(),
		).map((r) => r.map((c) => c.value)),
	);

type IndexFileOptions = { key: string; version: string | null; file: RupeaLedgerFile };

/** What changing a file touched: the commodities whose lots it held before or holds now, and the days its transactions span. */
export type Touched = { commodities: string[]; spans: Span[] };

/** Replaces what a file indexes, each description keeping its embedding, so saving a file never re-embeds it. */
export const indexFile = (
	ledgerId: string,
	{ key, version, file }: IndexFileOptions,
): ResultAsync<Touched> => {
	const untyped = untypedAccount(file);
	if (untyped) return errAsync(untyped);

	return atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const fileId = await saveVersion(tx, { ledgerId, key, version });
				const rows = rowsOf(ledgerId, fileId, file);
				const prices = await withSymbols(tx, { feed: Feed.Ledger, ledgerId }, rows.prices);
				const links = await withFeedSymbols(tx, rows.links);

				const lotsBefore = await lotCommoditiesOf(tx, fileId);
				const spansBefore = await spansOf(tx, fileId);

				await tx.deleteFrom('metadata').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('prices').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('symbolLinks').where('fileId', '=', fileId).execute();

				await insertAll(tx, 'transactions', rows.transactions);
				await replaceOldTransactions(tx, fileId, rows.transactions);
				await insertAll(tx, 'postings', rows.postings);
				await insertAll(tx, 'prices', prices);
				await insertAll(tx, 'symbolLinks', links);
				await insertAll(tx, 'metadata', rows.metadata);

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

type VersionOptions = { ledgerId: string; key: string; version: string | null };

const saveVersion = (db: Database, { ledgerId, key, version }: VersionOptions) =>
	db
		.insertInto('ledgerFiles')
		.values({ ledgerId, key, version })
		.onConflict((o) => o.columns(['ledgerId', 'key']).doUpdateSet({ version }))
		.returning('id')
		.executeTakeFirstOrThrow()
		.then((f) => f.id);

/** Each table's rows for a parsed file, its prices and links still to be put on their symbols. */
const rowsOf = (ledgerId: string, fileId: string, file: RupeaLedgerFile) => {
	const indexed = file.transactions.map((t) => ({
		id: uuidv7(),
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
	}));
	const postings = indexed.flatMap(({ id, transaction, postings: p }) =>
		p.flatMap(({ id: postingId, posting }, position) => {
			const type = accountType(posting.account);
			return type
				? [
						{
							id: postingId,
							ledgerId,
							transactionId: id,
							date: transaction.date.toString(),
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
 * Replaces a file's old transactions with the rows just inserted, which take the embedding of their description.
 * The update still sees the deleted rows, as Postgres runs a statement on one snapshot, so it keeps to the new ones.
 */
const replaceOldTransactions = (db: Database, fileId: string, rows: { id: string }[]) => {
	const ids = rows.map((r) => r.id);
	return db
		.with('deleted', (db) =>
			db
				.deleteFrom('transactions')
				.where('transactions.fileId', '=', fileId)
				.where((e) => noneOf(e.ref('transactions.id'), ids, 'uuid'))
				.returning(['description', 'embedding', 'embeddingModel']),
		)
		.with('embedded', (db) =>
			db
				.selectFrom('deleted')
				.select(['deleted.description', 'deleted.embedding', 'deleted.embeddingModel'])
				.distinctOn('deleted.description')
				.where('deleted.embedding', 'is not', null),
		)
		.updateTable('transactions')
		.from('embedded')
		.set((e) => ({
			embedding: e.ref('embedded.embedding'),
			embeddingModel: e.ref('embedded.embeddingModel'),
		}))
		.where('transactions.fileId', '=', fileId)
		.whereRef('transactions.description', '=', 'embedded.description')
		.where((e) => anyOf(e.ref('transactions.id'), ids, 'uuid'))
		.execute();
};

type MetadataOwner = { ledgerId: string } & (
	{ fileId: string } | { transactionId: string } | { postingId: string }
);

const ownedBy = (o: MetadataOwner, m: RupeaMetadata) =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => ({ key, value: v })))
		.map((e, i) => ({ ...o, position: i, ...e }));

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
