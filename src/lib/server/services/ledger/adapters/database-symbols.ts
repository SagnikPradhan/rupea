import { atomically } from '#lib/server/db/atomically.ts';
import { json } from '#lib/server/db/expressions.ts';
import { ROWS_PER_STATEMENT } from '#lib/server/db/index.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import { displayLocation } from '../domain/parser';
import type { Feed, PriceSource } from '../domain/types';
import { rewritePriceYears } from './database-years';
import type { Quote } from './feed';

export type FeedSymbol = { id: string; feed: Feed; symbol: string };

export const findSymbol = (id: string): ResultAsync<FeedSymbol | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('symbols')
				.select(['symbols.id', 'symbols.feed', 'symbols.symbol'])
				.where('symbols.id', '=', id)
				.executeTakeFirst()
				.then((s) => s ?? null),
		),
	);

/** The day of a symbol's latest quote, so a fetch asks only from there on. */
export const findLatestQuote = (symbolId: string): ResultAsync<Temporal.PlainDate | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('prices')
				.select('prices.date')
				.where('prices.symbolId', '=', symbolId)
				.where('prices.fileId', 'is', null)
				.orderBy('prices.date', 'desc')
				.limit(1)
				.executeTakeFirst()
				.then((q) => (q ? Temporal.PlainDate.from(q.date) : null)),
		),
	);

/** A day quoted again replaces the quote it had, since a feed may correct one; within one answer the last quote of a day wins. */
export const saveQuotes = (
	symbolId: string,
	source: PriceSource,
	quotes: Quote[],
): ResultAsync<void> =>
	atomically(() =>
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
						.insertInto('prices')
						.values(chunk)
						.onConflict((oc) =>
							oc
								.columns(['symbolId', 'date'])
								.where('fileId', 'is', null)
								.doUpdateSet((e) => ({
									priceAmount: e.ref('excluded.priceAmount'),
									priceCommodity: e.ref('excluded.priceCommodity'),
								})),
						)
						.execute();
				await rewritePriceYears(db, rows);
			}),
		),
	);

/** A fetch that worked clears the error; one that failed keeps when the failing began. */
export const saveFetch = (symbolId: string, error: RupeaError | null): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const now = new Date();
			const row = error
				? { symbolId, error: json(error), failingSince: now }
				: { symbolId, error: null, failingSince: null, fetchedAt: now };
			await db
				.insertInto('symbolFetches')
				.values(row)
				.onConflict((oc) =>
					oc.column('symbolId').doUpdateSet((e) => ({
						...row,
						failingSince: error
							? e.fn.coalesce('symbolFetches.failingSince', 'excluded.failingSince')
							: null,
					})),
				)
				.execute();
		}),
	);

/** Symbols the ledger links that no fetch has worked for yet, unless the feed said it has none. */
export const listUnfetched = (ledgerId: string): ResultAsync<string[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('symbolLinks as l')
				.leftJoin('symbolFetches as f', 'f.symbolId', 'l.symbolId')
				.select('l.symbolId')
				.distinct()
				.where('l.ledgerId', '=', ledgerId)
				.where('f.fetchedAt', 'is', null)
				.where((e) => sql`${e.ref('f.error')}->>'type'`, 'is distinct from', 'FeedSymbolUnknown')
				.execute()
				.then((r) => r.map((s) => s.symbolId)),
		),
	);

export type RepeatedLink = { commodity: string; locations: string[] };

/** Commodities linked more than once from one day, which would leave their price to chance. */
export const listRepeatedLinks = (ledgerId: string): ResultAsync<RepeatedLink[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('symbolLinks as l')
				.innerJoin('ledgerFiles as f', 'f.id', 'l.fileId')
				.select((e) => [
					'l.alias as commodity',
					sql<
						{ file: string; line: number }[]
					>`json_agg(json_build_object('file', ${e.ref('f.key')}, 'line', ${e.ref('l.line')}) order by ${e.ref('f.key')}, ${e.ref('l.line')})`.as(
						'locations',
					),
				])
				.where('l.ledgerId', '=', ledgerId)
				.groupBy(['l.alias', 'l.since'])
				.having((e) => e.fn.countAll(), '>', 1)
				.orderBy('l.alias')
				.orderBy('l.since')
				.execute()
				.then((r) =>
					r.map((l) => ({ commodity: l.commodity, locations: l.locations.map(displayLocation) })),
				),
		),
	);
