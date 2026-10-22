import { ROWS_PER_STATEMENT, type Database } from '#lib/server/db/index.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { CURRENCIES } from '../domain/lots';
import { displayLocation } from '../domain/parser';
import { marketPrices } from '../domain/prices';
import { accountType, BALANCE_TYPES } from '../domain/taxonomy';
import { Feed, type RupeeLedgerFile, type RupeeMetadata } from '../domain/types';
import {
	ledgerFiles,
	metadata as metadataTable,
	postings,
	prices as priceTable,
	symbolLinks as linkTable,
	symbols as symbolTable,
	transactions as transactionTable,
} from './database-schema';

export type FileVersion = { key: string; version: string | null };

export const listIndexedFiles = (ledgerId: string): ResultAsync<FileVersion[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ key: ledgerFiles.key, version: ledgerFiles.version })
				.from(ledgerFiles)
				.where(eq(ledgerFiles.ledgerId, ledgerId)),
		),
	);

/** Of these checksums, those in a file's metadata, unlocked or as uploaded. */
export const findImported = (ledgerId: string, checksums: string[]): ResultAsync<string[]> =>
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

type IndexFileOptions = { key: string; version: string | null; file: RupeeLedgerFile };

// One transaction, so readers see the old file or the new one. A description
// keeps its embedding through a reindex, so saving a file never re-embeds it.
// Returns the commodities whose lots the file held before or holds now.
export const indexFile = (
	ledgerId: string,
	{ key, version, file }: IndexFileOptions,
): ResultAsync<string[]> => {
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
					symbol: p.commodity,
					fileId,
					line: p.location.line,
					date: p.date.toString(),
					priceAmount: p.price.amount,
					priceCommodity: p.price.commodity,
					source: p.source,
				}));
				const linkRows = file.links.map((l) => ({
					feed: l.feed,
					symbol: l.symbol,
					ledgerId,
					alias: l.commodity,
					since: l.since?.toString() ?? null,
					fileId,
					line: l.location.line,
				}));
				const metadataRows = [
					...ownedBy({ ledgerId, fileId }, file.metadata),
					...indexed.flatMap(({ id, transaction }) =>
						ownedBy({ ledgerId, transactionId: id }, transaction.metadata),
					),
					...indexed.flatMap(({ postings: p }) =>
						p.flatMap(({ id, posting }) => ownedBy({ ledgerId, postingId: id }, posting.metadata)),
					),
				];

				const before = await lotCommoditiesOf(tx, fileId);
				await tx.delete(metadataTable).where(eq(metadataTable.fileId, fileId));
				await tx.delete(transactionTable).where(eq(transactionTable.fileId, fileId));
				await tx.delete(priceTable).where(eq(priceTable.fileId, fileId));
				await tx.delete(linkTable).where(eq(linkTable.fileId, fileId));
				// A transaction's statements share one connection, so they go one at a time.
				for (const chunk of chunks(transactionRows, ROWS_PER_STATEMENT))
					await tx.insert(transactionTable).values(chunk);
				for (const chunk of chunks(postingRows, ROWS_PER_STATEMENT))
					await tx.insert(postings).values(chunk);
				const priced = await withSymbols(tx, { feed: Feed.Ledger, ledgerId }, priceRows);
				for (const chunk of chunks(priced, ROWS_PER_STATEMENT))
					await tx.insert(priceTable).values(chunk);
				const linked = await withFeedSymbols(tx, linkRows);
				for (const chunk of chunks(linked, ROWS_PER_STATEMENT))
					await tx.insert(linkTable).values(chunk);
				for (const chunk of chunks(metadataRows, ROWS_PER_STATEMENT))
					await tx.insert(metadataTable).values(chunk);
				const after = await lotCommoditiesOf(tx, fileId);

				return [...before, ...after];
			}),
		),
	);
};

/** Returns the commodities whose lots the file held. */
export const unindexFile = (ledgerId: string, key: string): ResultAsync<string[]> =>
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

/** Returns the commodities whose lots the file holds. */
export const renameIndexedFile = (
	ledgerId: string,
	from: string,
	to: string,
): ResultAsync<string[]> =>
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

type Owner = { feed: Feed; ledgerId: string | null };

/**
 * Puts each row on its owner's symbol of that name, made the first time it is named. New symbols
 * go in sorted, so two syncs making the same ones take their locks in one order, and one another
 * sync made meanwhile is updated in place so that it is still returned.
 */
const withSymbols = async <R extends { symbol: string }>(db: Database, owner: Owner, rows: R[]) => {
	const bySymbol = Object.groupBy(rows, (r) => r.symbol);
	const names = Object.keys(bySymbol).toSorted();
	const columns = { id: symbolTable.id, symbol: symbolTable.symbol };

	const known = await db
		.select(columns)
		.from(symbolTable)
		.where(
			and(
				eq(symbolTable.feed, owner.feed),
				owner.ledgerId ? eq(symbolTable.ledgerId, owner.ledgerId) : isNull(symbolTable.ledgerId),
				inArray(symbolTable.symbol, names),
			),
		);
	const seen = new Set(known.map((k) => k.symbol));
	const missing = names.filter((n) => !seen.has(n));
	const made = missing.length
		? await db
				.insert(symbolTable)
				.values(missing.map((n) => ({ ...owner, symbol: n })))
				.onConflictDoUpdate({
					target: [symbolTable.feed, symbolTable.ledgerId, symbolTable.symbol],
					set: { symbol: sql`excluded.symbol` },
				})
				.returning(columns)
		: [];

	return [...known, ...made].flatMap((s) =>
		(bySymbol[s.symbol] ?? []).map((r) => ({ ...r, symbolId: s.id })),
	);
};

/** Puts each link on its feed's symbol, which every ledger shares; one feed at a time, in order. */
const withFeedSymbols = async <R extends { feed: Feed; symbol: string }>(
	db: Database,
	rows: R[],
) => {
	const byFeed = Object.groupBy(rows, (r) => r.feed);
	const feeds = Object.values(Feed).filter((f) => byFeed[f]);
	const linked = [];
	for (const f of feeds)
		linked.push(...(await withSymbols(db, { feed: f, ledgerId: null }, byFeed[f] ?? [])));
	return linked;
};

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
