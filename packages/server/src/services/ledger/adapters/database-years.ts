import { anyOf } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import { NO_AMOUNT, writeSeries } from '../domain/series';
import { Feed, PriceSource } from '../domain/types';
import type { PriceSources, PriceYear } from '../domain/worth';

/** How many rows one statement writes, since each carries a year of amounts. */
const ROWS_WRITTEN = 200;

/**
 * The ledger's own symbols and its links, each link holding from its since
 * until the next, so of two from one day the later written holds.
 */
export const listPriceSources = (ledgerId: string): ResultAsync<PriceSources> =>
	withContext('db')((db) =>
		attempt(async () => {
			const own = await db
				.selectFrom('symbols as s')
				.select(['s.id', 's.symbol'])
				.where('s.feed', '=', Feed.Ledger)
				.where('s.ledgerId', '=', ledgerId)
				.execute();
			const links = await db
				.selectFrom('symbolLinks as l')
				.select((e) => {
					const since = sql<string>`coalesce(${e.ref('l.since')}, '-infinity'::date)`;
					return [
						'l.alias',
						'l.symbolId',
						since.as('since'),
						sql<string>`lead(${since}) over (partition by ${e.ref('l.alias')} order by ${since}, ${e.ref('l.id')})`.as(
							'until',
						),
					];
				})
				.where('l.ledgerId', '=', ledgerId)
				.execute();

			return { own, links: links.map((l) => ({ ...l, until: l.until ?? null })) };
		}),
	);

/** The year rows of these symbols in a span of years. */
export const listPriceYears = (
	symbols: string[],
	{ from, to }: { from: number; to: number },
): ResultAsync<PriceYear[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('priceYears as y')
				.select(['y.symbolId', 'y.priceCommodity', 'y.year', 'y.amounts'])
				.where((e) => anyOf(e.ref('y.symbolId'), symbols, 'uuid'))
				.where('y.year', '>=', from)
				.where('y.year', '<=', to)
				.execute(),
		),
	);

/**
 * Builds the price years of the symbols a ledger indexed before that table has
 * none of.
 */
export const saveMissingYears = (ledgerId: string): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const symbols = await symbolsUsedBy(tx, ledgerId);
				await rewritePriceYears(tx, await unbuiltPrices(tx, symbols));
			}),
		),
	);

/** Rebuilds the price years of every symbol a ledger uses. */
export const saveEveryYear = (ledgerId: string): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const symbols = await symbolsUsedBy(tx, ledgerId);
				await rewritePriceYears(tx, await pricesOf(tx, symbols));
			}),
		),
	);

const daysIn = (y: number) => Temporal.PlainDate.from({ year: y, month: 1, day: 1 }).daysInYear;

const dayOf = (d: string) => Temporal.PlainDate.from(d).dayOfYear - 1;

const symbolsUsedBy = async (tx: Database, ledgerId: string) => {
	const own = tx
		.selectFrom('symbols as s')
		.select('s.id as id')
		.where('s.feed', '=', Feed.Ledger)
		.where('s.ledgerId', '=', ledgerId);
	const linked = tx
		.selectFrom('symbolLinks as l')
		.select('l.symbolId as id')
		.where('l.ledgerId', '=', ledgerId);
	const used = await own.union(linked).execute();

	return used.map((u) => u.id);
};

const pricesOf = (tx: Database, symbols: string[]) =>
	tx
		.selectFrom('prices as p')
		.select(['p.symbolId', 'p.date'])
		.where((e) => anyOf(e.ref('p.symbolId'), symbols, 'uuid'))
		.execute();

/**
 * Every price of those of these symbols with no year row at all. A symbol has
 * rows for all its priced years or none, so one row says it is built.
 */
const unbuiltPrices = async (tx: Database, symbols: string[]) => {
	const built = await tx
		.selectFrom('priceYears as y')
		.select('y.symbolId')
		.distinct()
		.where((e) => anyOf(e.ref('y.symbolId'), symbols, 'uuid'))
		.execute();
	const found = new Set(built.map((b) => b.symbolId));

	return pricesOf(
		tx,
		symbols.filter((s) => !found.has(s)),
	);
};

export type PriceChange = { symbolId: string; date: string };

/**
 * Rewrites the years these prices fall in, each day keeping the price that wins
 * it: a P line over an at-price, then the later line. A year stays apart from
 * every other, since a read carries the last price on itself. A symbol is
 * shared across ledgers, so each writer holds it until commit, taking them in
 * order so that two writers cannot wait on each other. A symbol with no rows
 * yet gets all its years, not only these.
 */
export const rewritePriceYears = async (tx: Database, changes: PriceChange[]) => {
	const locked = [...new Set(changes.map((c) => c.symbolId))].toSorted((a, b) =>
		a.localeCompare(b),
	);
	for (const id of locked)
		await sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`.execute(tx); // NOSONAR -- locks must be taken in this order, or writers can deadlock

	const unbuilt = await unbuiltPrices(tx, locked);
	const years = Map.groupBy([...changes, ...unbuilt], (c) => Temporal.PlainDate.from(c.date).year);

	for (const [year, changed] of years) {
		const symbols = [...new Set(changed.map((c) => c.symbolId))];

		await tx // NOSONAR -- a transaction's statements share one connection, so they run in turn
			.deleteFrom('priceYears')
			.where('year', '=', year)
			.where((e) => anyOf(e.ref('symbolId'), symbols, 'uuid'))
			.execute();

		const found = await tx // NOSONAR -- a transaction's statements share one connection, so they run in turn
			.selectFrom('prices as p')
			.select(['p.symbolId', 'p.date', 'p.priceAmount', 'p.priceCommodity'])
			.where((e) => anyOf(e.ref('p.symbolId'), symbols, 'uuid'))
			.where('p.date', '>=', `${year.toString().padStart(4, '0')}-01-01`)
			.where('p.date', '<=', `${year.toString().padStart(4, '0')}-12-31`)
			.orderBy('p.symbolId')
			.orderBy('p.date')
			.orderBy((e) => e('p.source', '=', PriceSource.Line), 'desc')
			.orderBy('p.line', 'desc')
			.execute();
		if (found.length === 0) continue;

		const winners = found.filter(
			(p, i) => i === 0 || found[i - 1]?.date !== p.date || found[i - 1]?.symbolId !== p.symbolId,
		);
		const rows = Object.values(
			Object.groupBy(winners, (p) => `${p.symbolId} ${p.priceCommodity}`),
		).flatMap((quotes = []) => {
			const quote = quotes[0];
			if (!quote) return [];

			const amounts = Array.from({ length: daysIn(year) }, () => NO_AMOUNT);
			quotes.forEach((q) => {
				amounts[dayOf(q.date)] = q.priceAmount;
			});

			return [
				{
					symbolId: quote.symbolId,
					priceCommodity: quote.priceCommodity,
					year,
					amounts: writeSeries(amounts),
				},
			];
		});

		for (const chunk of chunks(rows, ROWS_WRITTEN))
			await tx.insertInto('priceYears').values(chunk).execute(); // NOSONAR -- a transaction's statements share one connection, so they run in turn
	}
};
