import { anyOf, noneOf } from '#lib/server/db/expressions.ts';
import { ROWS_PER_STATEMENT, type Queries } from '#lib/server/db/index.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { CURRENCIES } from '../domain/lots';
import { displayLocation } from '../domain/parser';
import { marketPrices } from '../domain/prices';
import { accountType, BALANCE_TYPES } from '../domain/taxonomy';
import { Feed, type RupeeLedgerFile, type RupeeMetadata } from '../domain/types';

export type FileVersion = { key: string; version: string | null };

export const listIndexedFiles = (ledgerId: string): ResultAsync<FileVersion[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.selectFrom('ledgerFiles')
				.select(['ledgerFiles.key', 'ledgerFiles.version'])
				.where('ledgerFiles.ledgerId', '=', ledgerId)
				.execute(),
		),
	);

/** Of these checksums, those in a file's metadata, unlocked or as uploaded. */
export const findImported = (ledgerId: string, checksums: string[]): ResultAsync<string[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.selectFrom('metadata')
				.select('metadata.value')
				.distinct()
				.where('metadata.ledgerId', '=', ledgerId)
				.where('metadata.key', 'in', ['checksum', 'original-checksum'])
				.where(anyOf('metadata.value', checksums, 'text'))
				.where('metadata.fileId', 'is not', null)
				.execute(),
		).map((r) => r.map((c) => c.value)),
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

	return withContext('kysely')((kysely) =>
		attempt(() =>
			kysely.transaction().execute(async (tx) => {
				const fileId = await tx
					.insertInto('ledgerFiles')
					.values({ ledgerId, key, version })
					.onConflict((o) => o.columns(['ledgerId', 'key']).doUpdateSet({ version }))
					.returning('id')
					.executeTakeFirstOrThrow()
					.then((f) => f.id);
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
					embedding: embedding(embedded[transaction.description]),
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
					commodity: p.commodity,
					row: {
						fileId,
						line: p.location.line,
						date: p.date.toString(),
						priceAmount: p.price.amount,
						priceCommodity: p.price.commodity,
						source: p.source,
					},
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
				await tx.deleteFrom('metadata').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('transactions').where('fileId', '=', fileId).execute();
				await tx.deleteFrom('prices').where('fileId', '=', fileId).execute();
				// A transaction's statements share one connection, so they go one at a time.
				for (const chunk of chunks(transactionRows, ROWS_PER_STATEMENT))
					await tx.insertInto('transactions').values(chunk).execute();
				for (const chunk of chunks(postingRows, ROWS_PER_STATEMENT))
					await tx.insertInto('postings').values(chunk).execute();
				const symbolled = await withSymbols(tx, ledgerId, priceRows);
				for (const chunk of chunks(symbolled, ROWS_PER_STATEMENT))
					await tx.insertInto('prices').values(chunk).execute();
				for (const chunk of chunks(metadataRows, ROWS_PER_STATEMENT))
					await tx.insertInto('metadata').values(chunk).execute();
				const after = await lotCommoditiesOf(tx, fileId);

				return [...before, ...after];
			}),
		),
	);
};

/** Returns the commodities whose lots the file held. */
export const unindexFile = (ledgerId: string, key: string): ResultAsync<string[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely.transaction().execute(async (tx) => {
				const file = await tx
					.selectFrom('ledgerFiles')
					.select('ledgerFiles.id')
					.where('ledgerFiles.ledgerId', '=', ledgerId)
					.where('ledgerFiles.key', '=', key)
					.executeTakeFirst();
				if (!file) return [];

				const touched = await lotCommoditiesOf(tx, file.id);
				await tx.deleteFrom('ledgerFiles').where('id', '=', file.id).execute();
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
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.updateTable('ledgerFiles')
				.set({ key: to })
				.where('ledgerId', '=', ledgerId)
				.where('key', '=', from)
				.returning('id')
				.executeTakeFirst()
				.then((f) => (f ? lotCommoditiesOf(kysely, f.id) : [])),
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

type Embedded = { embedding: string | null; embeddingModel: string | null };

// Read as the text pgvector prints, since the driver has no parser for the type.
const embeddingsIn = (kysely: Queries, fileId: string): Promise<Record<string, Embedded>> =>
	kysely
		.selectFrom('transactions')
		.select([
			'transactions.description',
			sql<string>`${sql.ref('transactions.embedding')}::text`.as('embedding'),
			'transactions.embeddingModel',
		])
		.distinctOn('transactions.description')
		.where('transactions.fileId', '=', fileId)
		.where('transactions.embedding', 'is not', null)
		.execute()
		.then((l) => Object.fromEntries(l.map((r) => [r.description, r])));

const embedding = (e: Embedded | undefined) =>
	e?.embedding ? sql<number[]>`${e.embedding}::vector` : null;

type MetadataOwner = { ledgerId: string } & (
	{ fileId: string } | { transactionId: string } | { postingId: string }
);

const ownedBy = (o: MetadataOwner, m: RupeeMetadata) =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => ({ key, value: v })))
		.map((e, i) => ({ ...o, position: i, ...e }));

/**
 * Puts each price on the ledger's own symbol for its commodity, made the first time it is priced.
 * New symbols go in sorted, so two syncs making the same ones take their locks in one order, and
 * one another sync made meanwhile is updated in place so that it is still returned.
 */
const withSymbols = async <R>(
	kysely: Queries,
	ledgerId: string,
	prices: { commodity: string; row: R }[],
) => {
	const byCommodity = Object.groupBy(prices, (p) => p.commodity);
	const commodities = Object.keys(byCommodity).toSorted();

	const known = commodities.length
		? await kysely
				.selectFrom('symbols')
				.select(['symbols.id', 'symbols.symbol'])
				.where('symbols.feed', '=', Feed.Ledger)
				.where('symbols.ledgerId', '=', ledgerId)
				.where('symbols.symbol', 'in', commodities)
				.execute()
		: [];
	const seen = new Set(known.map((k) => k.symbol));
	const missing = commodities.filter((c) => !seen.has(c));
	const made = missing.length
		? await kysely
				.insertInto('symbols')
				.values(missing.map((c) => ({ feed: Feed.Ledger, symbol: c, ledgerId })))
				.onConflict((oc) =>
					oc
						.columns(['feed', 'ledgerId', 'symbol'])
						.doUpdateSet((e) => ({ symbol: e.ref('excluded.symbol') })),
				)
				.returning(['symbols.id', 'symbols.symbol'])
				.execute()
		: [];

	return [...known, ...made].flatMap((s) =>
		(byCommodity[s.symbol] ?? []).map((p) => ({ ...p.row, symbolId: s.id })),
	);
};

const lotCommoditiesOf = (kysely: Queries, fileId: string): Promise<string[]> =>
	kysely
		.selectFrom('postings')
		.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
		.select('postings.commodity')
		.distinct()
		.where('transactions.fileId', '=', fileId)
		.where('postings.accountType', 'in', BALANCE_TYPES)
		.where(noneOf('postings.commodity', CURRENCIES, 'text'))
		.execute()
		.then((r) => r.map((c) => c.commodity));
