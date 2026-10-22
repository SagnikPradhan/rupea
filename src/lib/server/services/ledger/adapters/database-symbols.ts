import { ROWS_PER_STATEMENT } from '#lib/server/db/index.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { displayLocation } from '../domain/parser';
import type { Feed, PriceSource } from '../domain/types';
import {
	ledgerFiles,
	prices as priceTable,
	symbolFetches as fetchTable,
	symbolLinks as linkTable,
	symbols as symbolTable,
} from './database-schema';
import type { Quote } from './feed';

export type FeedSymbol = { id: string; feed: Feed; symbol: string };

export const findSymbol = (id: string): ResultAsync<FeedSymbol | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ id: symbolTable.id, feed: symbolTable.feed, symbol: symbolTable.symbol })
				.from(symbolTable)
				.where(eq(symbolTable.id, id))
				.then(([s]) => s ?? null),
		),
	);

/** The day of a symbol's latest quote, so a fetch asks only from there on. */
export const findLatestQuote = (symbolId: string): ResultAsync<Temporal.PlainDate | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ date: priceTable.date })
				.from(priceTable)
				.where(and(eq(priceTable.symbolId, symbolId), isNull(priceTable.fileId)))
				.orderBy(desc(priceTable.date))
				.limit(1)
				.then(([q]) => (q ? Temporal.PlainDate.from(q.date) : null)),
		),
	);

/** A day quoted again replaces the quote it had, since a feed may correct one; within one answer the last quote of a day wins. */
export const saveQuotes = (
	symbolId: string,
	source: PriceSource,
	quotes: Quote[],
): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const daily = Object.values(Object.fromEntries(quotes.map((q) => [q.date.toString(), q])));
			const rows = daily.map((q) => ({
				symbolId,
				source,
				date: q.date.toString(),
				priceAmount: q.price.amount,
				priceCommodity: q.price.commodity,
			}));
			for (const chunk of chunks(rows, ROWS_PER_STATEMENT))
				await db
					.insert(priceTable)
					.values(chunk)
					.onConflictDoUpdate({
						target: [priceTable.symbolId, priceTable.date],
						targetWhere: sql`${priceTable.fileId} is null`,
						set: {
							priceAmount: sql`excluded.price_amount`,
							priceCommodity: sql`excluded.price_commodity`,
						},
					});
		}),
	);

/** A fetch that worked clears the error; one that failed keeps when the failing began. */
export const saveFetch = (symbolId: string, error: RupeeError | null): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const now = new Date();
			const row = error
				? { symbolId, error, failingSince: now }
				: { symbolId, error: null, failingSince: null, fetchedAt: now };
			const kept = sql`coalesce(${fetchTable.failingSince}, excluded.failing_since)`;
			await db
				.insert(fetchTable)
				.values(row)
				.onConflictDoUpdate({
					target: fetchTable.symbolId,
					set: { ...row, failingSince: error ? kept : null },
				});
		}),
	);

/** Symbols the ledger links that no fetch has worked for yet, unless the feed said it has none. */
export const listUnfetched = (ledgerId: string): ResultAsync<string[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectDistinct({ id: linkTable.symbolId })
				.from(linkTable)
				.leftJoin(fetchTable, eq(fetchTable.symbolId, linkTable.symbolId))
				.where(
					and(
						eq(linkTable.ledgerId, ledgerId),
						isNull(fetchTable.fetchedAt),
						sql`${fetchTable.error}->>'type' is distinct from 'FeedSymbolUnknown'`,
					),
				)
				.then((r) => r.map((s) => s.id)),
		),
	);

export type RepeatedLink = { commodity: string; locations: string[] };

/** Commodities linked more than once from one day, which would leave their price to chance. */
export const listRepeatedLinks = (ledgerId: string): ResultAsync<RepeatedLink[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({
					commodity: linkTable.alias,
					locations: sql<
						{ file: string; line: number }[]
					>`json_agg(json_build_object('file', ${ledgerFiles.key}, 'line', ${linkTable.line}) order by ${ledgerFiles.key}, ${linkTable.line})`,
				})
				.from(linkTable)
				.innerJoin(ledgerFiles, eq(ledgerFiles.id, linkTable.fileId))
				.where(eq(linkTable.ledgerId, ledgerId))
				.groupBy(linkTable.alias, linkTable.since)
				.having(sql`${count()} > 1`)
				.orderBy(linkTable.alias, linkTable.since)
				.then((r) =>
					r.map((l) => ({ commodity: l.commodity, locations: l.locations.map(displayLocation) })),
				),
		),
	);
