import { anyOf, noneOf } from '#lib/server/db/expressions.ts';
import { type Database } from '#lib/server/db/index.ts';
import { insertAll } from '#lib/server/db/insert.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { type RupeaError } from '@rupea/shared/errors.ts';
import { attempt, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Span } from '@rupea/shared/dates.ts';
import { sql, type SqlBool } from 'kysely';
import { GROUP_KEYS } from '../domain/groups';
import { CURRENCIES } from '@rupea/shared/money.ts';
import type { UnchangedEntry } from '../domain/parser';
import { INDEXER } from '../domain/sync';
import { BALANCE_TYPES } from '../domain/taxonomy';
import { Feed, type RupeaLedgerFile } from '../domain/types';
import { toSpans } from './database-queries';
import { rewritePriceYears } from './database-years';
import {
	changesFrom,
	fingerprintsIn,
	matchesFrom,
	notAmong,
	oldPrices,
	oldTransactions,
	priceChangesFrom,
	pricesOfUnchanged,
	rowsOfUnchanged,
	type OldTransaction,
} from './database-files-diff';
import {
	deleteOwnedBy,
	replaceOldTransactions,
	rowsOf,
	saveTransactions,
	saveVersion,
	untypedAccount,
} from './database-files-rows';
import { withAccounts, withFeedSymbols, withSymbols } from './database-files-resolve';

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

/**
 * Of these checksums, those in a file's metadata, unlocked or as uploaded, with
 * each file that cites one.
 */
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

/** The file holding the ledger's latest transaction, if any. */
export const findNewestFile = (ledgerId: string): ResultAsync<string | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('transactions')
				.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
				.select('ledgerFiles.key')
				.where('transactions.ledgerId', '=', ledgerId)
				.orderBy('transactions.date', 'desc')
				.orderBy('transactions.sortTime', 'desc')
				.orderBy('transactions.id', 'desc')
				.limit(1)
				.executeTakeFirst(),
		).map((r) => r?.key ?? null),
	);

export type Held = {
	indexerVersion: number | null;
	transactions: OldTransaction[];
	hashCounts: Record<string, number>;
};

/**
 * What a file's rows hold: its transactions, and how many of each hash can go
 * unread, which is none if an older indexer read it.
 */
export const findHeld = (ledgerId: string, key: string): ResultAsync<Held> =>
	withContext('db')((db) =>
		attempt(async () => {
			const file = await db
				.selectFrom('ledgerFiles')
				.select(['id', 'indexer'])
				.where('ledgerId', '=', ledgerId)
				.where('key', '=', key)
				.executeTakeFirst();
			const transactions = file ? await oldTransactions(db, file.id) : [];
			const byHash = Object.groupBy(transactions, (t) => t.hash ?? '');

			return {
				indexerVersion: file?.indexer ?? null,
				transactions,
				hashCounts:
					file?.indexer === INDEXER
						? Object.fromEntries(Object.entries(byHash).map(([h, g = []]) => [h, g.length]))
						: {},
			};
		}),
	);

type IndexFileOptions = {
	key: string;
	version: string;
	file: RupeaLedgerFile;
	failed: RupeaError[];
	held: Held;
	unchanged: UnchangedEntry[];
	lineHashes: Record<number, string>;
};

export type HoldingKey = { accountId: string; commodity: string };

/**
 * What changing a file touched: the commodities whose lots it held before or
 * holds now, the days its transactions span, what they post to, and whether any
 * names a group.
 */
export type Touched = {
	commodities: string[];
	spans: Span[];
	holdings: HoldingKey[];
	grouped: boolean;
};

/**
 * Replaces what a file indexes and what failed to parse in it, each transaction
 * keeping its id where it can and each description its embedding, so saving a
 * file neither moves a page nor re-embeds it. Transactions that hold what they
 * held keep their rows, so a small edit writes little, and those whose lines
 * did not change are not even compared.
 */
export const indexFile = (
	ledgerId: string,
	{ key, version, file, failed, held, unchanged, lineHashes }: IndexFileOptions,
): ResultAsync<Touched> => {
	const untyped = untypedAccount(file);
	if (untyped) return errAsync(untyped);

	return atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const fileId = await saveVersion(tx, { ledgerId, key, version });
				const old = held.transactions;
				const sameIndexer = held.indexerVersion === INDEXER;

				const unchangedRows = rowsOfUnchanged({ ledgerId, fileId, old, unchanged });
				const free = notAmong(old, unchangedRows);
				const rows = rowsOf({
					ledgerId,
					fileId,
					file,
					failed,
					lineHashes,
					matchOf: matchesFrom(free),
				});
				const read = rows.transactions.map((t) => t.id);
				const unmatched = notAmong(free, rows.transactions).map((o) => o.id);

				const postings = await withAccounts(tx, ledgerId, rows.postings);
				const prices = await withSymbols(tx, { feed: Feed.Ledger, ledgerId }, rows.prices);
				const links = await withFeedSymbols(tx, rows.links);

				const changes = changesFrom({
					old,
					fingerprintBefore: sameIndexer ? await fingerprintsIn(tx, read) : () => '',
					unchanged: unchangedRows,
					read: rows.transactions,
					postings,
					metadata: rows.metadata,
				});
				const heldPrices = await oldPrices(tx, fileId);
				const priceChanges = priceChangesFrom(
					heldPrices,
					[...prices, ...pricesOfUnchanged({ fileId, prices: heldPrices, old, unchangedRows })],
					sameIndexer,
				);
				const before = await touchedBy(tx, [...changes.moved, ...changes.stale, ...unmatched]);

				await tx.deleteFrom('metadata').where('fileId', '=', fileId).execute();
				await tx
					.deleteFrom('prices')
					.where((e) => anyOf(e.ref('id'), priceChanges.stale, 'uuid'))
					.execute();
				await tx.deleteFrom('symbolLinks').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('accountTerms').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('problems').where('fileId', '=', fileId).execute();
				await deleteOwnedBy(tx, changes.stale);

				await saveTransactions(tx, changes.transactions);
				await replaceOldTransactions(tx, fileId, unmatched);
				await insertAll(tx, 'postings', changes.postings);
				await insertAll(tx, 'prices', priceChanges.added);
				await insertAll(tx, 'symbolLinks', links);
				await insertAll(tx, 'accountTerms', rows.accounts);
				await insertAll(tx, 'metadata', changes.metadata);
				await insertAll(tx, 'problems', rows.problems);
				const stale = new Set(priceChanges.stale);
				await rewritePriceYears(tx, [
					...heldPrices.filter((p) => stale.has(p.id)),
					...priceChanges.added,
				]);

				const after = await touchedBy(tx, [...changes.moved, ...changes.stale, ...changes.added]);
				return touchedByEither(before, after);
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
				if (!file) return { commodities: [], spans: [], holdings: [], grouped: false };

				const held = await oldTransactions(tx, file.id);
				const touched = await touchedBy(
					tx,
					held.map((t) => t.id),
				);
				const prices = await oldPrices(tx, file.id);
				await tx.deleteFrom('ledgerFiles').where('id', '=', file.id).execute();
				await rewritePriceYears(tx, prices);
				return touched;
			}),
		),
	);

/**
 * A key spans no days and changes no amount or group, so a rename touches only
 * the commodities whose lots the file holds.
 */
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
				.then((c) => ({ commodities: c, spans: [], holdings: [], grouped: false })),
		),
	);

const touchedByEither = (before: Touched, after: Touched): Touched => ({
	commodities: [...before.commodities, ...after.commodities],
	spans: [...before.spans, ...after.spans],
	holdings: [...before.holdings, ...after.holdings],
	grouped: before.grouped || after.grouped,
});

/**
 * What these transactions touch: the commodities whose lots they hold, the days
 * they span, what they post to, and whether any names a group.
 */
export const touchedBy = async (db: Database, ids: string[]): Promise<Touched> => {
	const holdings = await db
		.selectFrom('postings')
		.select(['accountId', 'commodity', 'accountType'])
		.distinct()
		.where((e) => anyOf(e.ref('transactionId'), ids, 'uuid'))
		.execute();
	const group = await db
		.selectFrom('metadata')
		.select('id')
		.where((e) => anyOf(e.ref('transactionId').$notNull(), ids, 'uuid'))
		.where('key', 'in', GROUP_KEYS)
		.limit(1)
		.executeTakeFirst();
	const days = await db
		.selectFrom('transactions')
		.select((e) => [
			e.fn.min<string | null>('date').as('from'),
			e.fn.max<string | null>('date').as('to'),
		])
		.where((e) => anyOf(e.ref('id'), ids, 'uuid'))
		.executeTakeFirstOrThrow();

	return {
		commodities: holdings
			.filter((p) => BALANCE_TYPES.includes(p.accountType) && !CURRENCIES.includes(p.commodity))
			.map((p) => p.commodity),
		spans: toSpans(days),
		holdings: holdings.map((p) => ({ accountId: p.accountId, commodity: p.commodity })),
		grouped: group !== undefined,
	};
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
