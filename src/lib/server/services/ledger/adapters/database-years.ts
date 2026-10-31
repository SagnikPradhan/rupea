import { anyOf } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import { NO_AMOUNT, writeSeries } from '../domain/series';
import { BALANCE_TYPES } from '../domain/taxonomy';
import { Feed, PriceSource } from '../domain/types';
import type { BalanceYear, PartOf, PriceSources, PriceYear } from '../domain/worth';
import type { HoldingKey } from './database-files';
import { amongHoldings } from './database-queries';

/** How many rows one statement writes, since each carries a year of amounts. */
const ROWS_WRITTEN = 200;

type FirstHeldOptions = { parts: PartOf[]; to: Temporal.PlainDate };

/** The first day any of these accounts moved, or null when none did by the month holding to. */
export const findFirstHeld = (
	ledgerId: string,
	{ parts, to }: FirstHeldOptions,
): ResultAsync<Temporal.PlainDate | null> =>
	withContext('db')((db) =>
		attempt(async () => {
			const accounts = parts.map((p) => p.accountId);
			const first = await db
				.selectFrom('monthlyDeltas as m')
				.select((e) => e.fn.min('m.month').as('month'))
				.where('m.ledgerId', '=', ledgerId)
				.where('m.accountType', 'in', BALANCE_TYPES)
				.where('m.month', '<=', to.toString())
				.where((e) => anyOf(e.ref('m.accountId'), accounts, 'uuid'))
				.executeTakeFirst();
			if (!first?.month) return null;

			const after = Temporal.PlainDate.from(first.month).add({ months: 1 }).toString();
			const day = await db
				.selectFrom('dailyDeltas as d')
				.select((e) => e.fn.min('d.date').as('date'))
				.where('d.ledgerId', '=', ledgerId)
				.where('d.accountType', 'in', BALANCE_TYPES)
				.where('d.date', '>=', first.month)
				.where('d.date', '<', after)
				.where((e) => anyOf(e.ref('d.accountId'), accounts, 'uuid'))
				.executeTakeFirst();

			return day?.date ? Temporal.PlainDate.from(day.date) : null;
		}),
	);

type YearsOptions = { accounts: string[]; from: number; to: number };

/** These accounts' balance years in a span of years, and each holding's last before it, whose last day carries on into it. */
export const listBalanceYears = (
	ledgerId: string,
	{ accounts, from, to }: YearsOptions,
): ResultAsync<BalanceYear[]> =>
	withContext('db')((db) =>
		attempt(async () => {
			const columns = [
				'y.accountId',
				'y.accountType',
				'y.commodity',
				'y.year',
				'y.balances',
			] as const;
			const during = db
				.selectFrom('balanceYears as y')
				.select(columns)
				.where('y.ledgerId', '=', ledgerId)
				.where((e) => anyOf(e.ref('y.accountId'), accounts, 'uuid'))
				.where('y.year', '>=', from)
				.where('y.year', '<=', to)
				.execute();
			const before = db
				.selectFrom('balanceYears as y')
				.select(columns)
				.distinctOn(['y.accountId', 'y.commodity'])
				.where('y.ledgerId', '=', ledgerId)
				.where((e) => anyOf(e.ref('y.accountId'), accounts, 'uuid'))
				.where('y.year', '<', from)
				.orderBy('y.accountId')
				.orderBy('y.commodity')
				.orderBy('y.year', 'desc')
				.execute();

			return (await Promise.all([before, during])).flat();
		}),
	);

/** The ledger's own symbols and its links, each link holding from its since until the next, so of two from one day the later written holds. */
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

type BalanceYearsOptions = {
	from: number;
	/** The last year rewritten, or null for every year after from. */
	to: number | null;
	holdings: HoldingKey[] | null;
};

/** Rewrites these holdings' balance years in a span of years. A move changes every balance after it, so it needs every later year too. Monthly deltas must already hold what they moved. */
export const saveBalanceYears = (id: string, o: BalanceYearsOptions): ResultAsync<void> =>
	atomically(() => withContext('db')((tx) => attempt(() => rewriteBalances(tx, id, o))));

/** Builds what a ledger indexed before these tables lacks: its balance years when it has none, and the price years of its symbols that have none. */
export const saveMissingYears = (ledgerId: string): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const built = await tx
					.selectFrom('balanceYears')
					.select('id')
					.where('ledgerId', '=', ledgerId)
					.limit(1)
					.executeTakeFirst();
				if (!built) await rewriteBalances(tx, ledgerId, { from: 1, to: null, holdings: null });

				const symbols = await symbolsUsedBy(tx, ledgerId);
				await rewritePriceYears(tx, await unbuiltPrices(tx, symbols));
			}),
		),
	);

/** Rebuilds all a ledger's balance years and the price years of every symbol it uses. */
export const saveEveryYear = (ledgerId: string): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				await rewriteBalances(tx, ledgerId, { from: 1, to: null, holdings: null });

				const symbols = await symbolsUsedBy(tx, ledgerId);
				await rewritePriceYears(tx, await pricesOf(tx, symbols));
			}),
		),
	);

const rewriteBalances = async (
	tx: Database,
	ledgerId: string,
	{ from, to, holdings }: BalanceYearsOptions,
) => {
	const first = Temporal.PlainDate.from({ year: from, month: 1, day: 1 }).toString();
	const after = to === null ? 'infinity' : `${(to + 1).toString().padStart(4, '0')}-01-01`;
	const year = sql<number>`extract(year from ${sql.ref('d.date')})::integer`;

	await tx
		.deleteFrom('balanceYears')
		.where('ledgerId', '=', ledgerId)
		.where('year', '>=', from)
		.$if(to !== null, (q) => q.where('year', '<=', to ?? from))
		.where((e) => amongHoldings(e.ref('accountId'), e.ref('commodity'), holdings))
		.execute();

	const moved = await tx
		.selectFrom('dailyDeltas as d')
		.select((e) => [
			'd.accountId',
			'd.accountType',
			'd.commodity',
			'd.date',
			year.as('year'),
			e.fn.sum<bigint>('d.amount').as('amount'),
		])
		.where('d.ledgerId', '=', ledgerId)
		.where('d.accountType', 'in', BALANCE_TYPES)
		.where('d.date', '>=', first)
		.where('d.date', '<', after)
		.where((e) => amongHoldings(e.ref('d.accountId'), e.ref('d.commodity'), holdings))
		.groupBy(['d.accountId', 'd.accountType', 'd.commodity', 'd.date'])
		.orderBy('d.date')
		.execute();
	if (moved.length === 0) return;

	const opening = await tx
		.selectFrom('monthlyDeltas as m')
		.select((e) => ['m.accountId', 'm.commodity', e.fn.sum<bigint>('m.amount').as('amount')])
		.where('m.ledgerId', '=', ledgerId)
		.where('m.accountType', 'in', BALANCE_TYPES)
		.where('m.month', '<', first)
		.where((e) => amongHoldings(e.ref('m.accountId'), e.ref('m.commodity'), holdings))
		.groupBy(['m.accountId', 'm.commodity'])
		.execute();
	const openingOf = new Map(opening.map((o) => [`${o.accountId} ${o.commodity}`, o.amount]));

	const rows = Object.values(Object.groupBy(moved, (m) => `${m.accountId} ${m.commodity}`)).flatMap(
		(days = []) => {
			const held = days[0];
			if (!held) return [];

			const opened = openingOf.get(`${held.accountId} ${held.commodity}`) ?? 0n;
			return yearsOf(days, opened).map(({ year: y, balances }) => ({
				ledgerId,
				accountId: held.accountId,
				accountType: held.accountType,
				commodity: held.commodity,
				year: y,
				balances: writeSeries(balances),
			}));
		},
	);

	for (const chunk of chunks(rows, ROWS_WRITTEN))
		await tx.insertInto('balanceYears').values(chunk).execute(); // NOSONAR -- a transaction's statements share one connection, so they run in turn
};

const daysIn = (y: number) => Temporal.PlainDate.from({ year: y, month: 1, day: 1 }).daysInYear;

const dayOf = (d: string) => Temporal.PlainDate.from(d).dayOfYear - 1;

/** A holding's balance on each day of each year it moved in, carrying on from what it opened with. */
const yearsOf = (moves: { date: string; year: number; amount: bigint }[], opening: bigint) => {
	const years = Map.groupBy(moves, (m) => m.year);
	const running = [opening];

	return [...years.entries()]
		.toSorted(([a], [b]) => a - b)
		.map(([year, moved]) => {
			const changes = new Map(moved.map((m) => [dayOf(m.date), m.amount]));
			const balances = Array.from({ length: daysIn(year) }, (_, day) => {
				running[0] = (running[0] ?? 0n) + (changes.get(day) ?? 0n);
				return running[0];
			});

			return { year, balances };
		});
};

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

/** Every price of those of these symbols with no year row at all. A symbol has rows for all its priced years or none, so one row says it is built. */
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
 * Rewrites the years these prices fall in, each day keeping the price that wins it: a P line over
 * an at-price, then the later line. A year stays apart from every other, since a read carries the
 * last price on itself. A symbol is shared across ledgers, so each writer holds it until commit,
 * taking them in order so that two writers cannot wait on each other. A symbol with no rows yet
 * gets all its years, not only these.
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
