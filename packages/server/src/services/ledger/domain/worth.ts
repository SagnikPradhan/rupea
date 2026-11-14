import { bucketKeyOf, type Bucket } from '@rupea/shared/balances.ts';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, multiply, type Amount, type Quantity } from './amounts';
import { costOn, heldCostsOn, unpricedIn, type CostMove, type RateThen } from './cost';
import { type Delta } from './deltas';
import { HOPS } from './holdings';
import { lengthOf, NO_AMOUNT, readDay, readSeries } from './series';
import { AccountType } from './types';

/**
 * Up to this many days are all shown; beyond it each stretch shows its lowest
 * and highest.
 */
const MOST_DAYS = 1000;

/**
 * What balance accounts were worth in rupees at the end of one day, owing below
 * zero as the accounts hold it, and how many commodities had no price.
 */
type Worth = {
	day: Temporal.PlainDate;
	assets: Amount;
	liabilities: Amount;
	worth: Amount;
	/**
	 * What each part was worth: an account, or one commodity it holds when worth
	 * is divided by commodity.
	 */
	parts: { account: string; commodity: string | null; amount: Amount }[];
	unpriced: number;
};

/** The part an account's balances count towards. */
export type PartOf = { accountId: string; part: string };

export type BalanceYear = {
	accountId: string;
	accountType: AccountType;
	commodity: string;
	year: number;
	balances: Buffer;
};

export type PriceYear = { symbolId: string; priceCommodity: string; year: number; amounts: Buffer };

/**
 * Where a commodity's prices come from: a ledger's own symbol, or a feed's
 * while a link holds.
 */
export type PriceSources = {
	own: { id: string; symbol: string }[];
	/** A null since holds from the start, and a null until for good. */
	links: { alias: string; symbolId: string; since: string | null; until: string | null }[];
};

/** The symbols that price these commodities, whether a ledger's own or a feed's. */
export const symbolsOf = ({ own, links }: PriceSources, commodities: string[]) => {
	const asked = new Set(commodities);
	const owned = own.filter((s) => asked.has(s.symbol)).map((s) => s.id);
	const linked = links.filter((l) => asked.has(l.alias)).map((l) => l.symbolId);

	return [...new Set([...owned, ...linked])];
};

export type WorthOfOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	parts: PartOf[];
	byCommodity: boolean;
	balances: BalanceYear[];
	prices: PriceYear[];
	sources: PriceSources;
	/** Each commodity's price on the day before from. */
	opening: Record<string, Quantity>;
};

/**
 * Each day values its balances at the latest price on or before it, reaching
 * rupees in at most two prices and rounding each step as multiply does, and
 * each part's balances are added before they are valued. Long spans keep each
 * stretch's lowest and highest days, and the last.
 */
export const worthOf = (o: WorthOfOptions): Worth[] => {
	const layout = layoutOf(o);
	const { count } = layout;
	const groups = groupsOf({ ...o, ...layout });
	const { rates } = ratesOf({ ...o, ...layout });
	const values = groups.map((g) => valuesOf(g.units, rates(g.commodity)));
	const worth = Array.from({ length: count }, () => 0n);
	values.forEach((v) =>
		v.forEach((x, i) => {
			if (x !== null) worth[i] = (worth[i] ?? 0n) + x;
		}),
	);

	return shownDays(worth).map((i) =>
		dayWorth(
			groups.map((g, n) => ({ ...g, value: values[n]?.[i] ?? null, held: g.units[i] ?? 0n })),
			{ day: o.from.add({ days: i }), byCommodity: o.byCommodity },
		),
	);
};

/**
 * The worth on one day, valued as worthOf values it, without walking the
 * others.
 */
export const worthOn = (o: WorthOfOptions, day: Temporal.PlainDate): Worth => {
	const layout = layoutOf(o);
	const { rateAt } = ratesOf({ ...o, ...layout });
	const i = o.from.until(day).days;

	return dayWorth(
		holdingsOf(o).map((g) => {
			const held = heldOn(
				g.years.map((y) => placedIn(y, layout)),
				i,
			);
			const price = rateAt(g.commodity, i);

			return { ...g, value: valueOf(g, { units: held, price }), held };
		}),
		{ day, byCommodity: o.byCommodity },
	);
};

type Counted = {
	asset: boolean;
	part: string;
	commodity: string;
	value: bigint | null;
	held: bigint;
};

const dayWorth = (
	counted: Counted[],
	{ day, byCommodity }: { day: Temporal.PlainDate; byCommodity: boolean },
): Worth => {
	const priced = counted.filter((g) => g.value !== null);
	const sumOf = (g: Counted[]) => g.reduce((t, x) => t + (x.value ?? 0n), 0n) as Amount;
	const unpriced = counted.filter((g) => g.value === null && g.held !== 0n);

	return {
		day,
		assets: sumOf(priced.filter((g) => g.asset)),
		liabilities: sumOf(priced.filter((g) => !g.asset)),
		worth: sumOf(priced),
		parts: sharesOf(priced, byCommodity),
		unpriced: new Set(unpriced.map((g) => g.commodity)).size,
	};
};

type EndingsOptions = {
	days: Temporal.PlainDate[];
	lots: CostMove[];
	bought: RateThen[];
	paid: boolean;
};

type Ending = {
	account: string;
	commodity: string;
	day: Temporal.PlainDate;
	units: Amount;
	value: Amount | null;
	price: Quantity | null;
	paid: Amount;
	missed: number;
	cost: Amount | null;
};

/**
 * What each part held of each commodity at the end of each of these days, which
 * a span holds: the units, their worth in rupees, or null with no price, the
 * price of a unit, and what the lots held had cost converted at that day's
 * prices, or null when a cost commodity had none, and what they had cost at the
 * prices of the days they were bought, when asked, and how many cost
 * commodities had none then. A part that held nothing in the span has none.
 */
export const endingsOf = (
	o: WorthOfOptions,
	{ days, lots, bought, paid }: EndingsOptions,
): Ending[] => {
	const layout = layoutOf(o);
	const { rateAt } = ratesOf({ ...o, ...layout });
	const partOf = new Map(o.parts.map((p) => [p.accountId, p.part]));
	const byHolding = Object.groupBy(lots, (m) => `${partOf.get(m.accountId)} ${m.commodity}`);
	const indexes = days.map((d) => o.from.until(d).days);

	return holdingsOf(o).flatMap((g) => {
		const moves = byHolding[`${g.part} ${g.commodity}`] ?? [];
		const costs = heldCostsOn({ moves, days });
		const paidOn = costOn({ moves, rates: bought, days });
		const missed = paid ? unpricedIn(moves, bought).length : 0;
		const placed = g.years.map((y) => placedIn(y, layout));

		return days.map((day, n) => {
			const i = indexes[n] ?? 0;
			const units = heldOn(placed, i);
			const price = g.commodity === DEFAULT_COMMODITY ? null : rateAt(g.commodity, i);
			const converted = Object.entries(costs[n] ?? {}).map(([c, amount]) => {
				if (c === DEFAULT_COMMODITY) return amount;
				const unit = rateAt(c, i);
				return unit === null ? null : multiply(amount as Amount, unit as Amount);
			});

			return {
				account: g.part,
				commodity: g.commodity,
				day,
				units,
				value: valueOf(g, { units, price }),
				price: price === null ? null : { amount: price as Amount, commodity: DEFAULT_COMMODITY },
				paid: paidOn[n] ?? (0n as Amount),
				missed,
				cost: converted.includes(null) ? null : (converted.reduce((t, c) => t! + c!, 0n) as Amount),
			};
		});
	});
};

const valueOf = (g: Held, { units, price }: { units: Amount; price: bigint | null }) => {
	if (units === 0n || g.commodity === DEFAULT_COMMODITY) return units;

	return price === null ? null : (multiply(units, price as Amount) as Amount);
};

/**
 * The historical deltas of endings, each in its day's bucket, with no value
 * counted as 1 unpriced when units are held, a cost with no price as 1, and the
 * lots missed with no price when bought.
 */
export const deltasOf = (endings: Ending[], bucket: Bucket): Delta[] =>
	endings.map((e) => ({
		account: e.account,
		commodity: e.commodity,
		bucket: bucketKeyOf[bucket](e.day),
		value: (e.value ?? 0n) as Amount,
		inflow: 0n as Amount,
		outflow: 0n as Amount,
		units: e.units,
		cost: (e.cost ?? 0n) as Amount,
		paid: e.paid,
		price: e.price,
		unpriced: (e.value === null && e.units !== 0n ? 1 : 0) + (e.cost === null ? 1 : 0) + e.missed,
	}));

/**
 * What a part's holdings of the day before were worth at that day's prices and
 * at the day before's, in step by day from the first.
 */
export type Move = { part: string; asset: boolean; before: bigint[]; after: bigint[] };

/**
 * Values each part's holdings of the day before at the prices of both days, so
 * that what changed between the two is price alone and not what was put in or
 * taken out. A holding with no price on either day counts on neither.
 */
export const movesOf = (o: WorthOfOptions): Move[] => {
	const layout = layoutOf(o);
	const { count } = layout;
	const groups = groupsOf({ ...o, ...layout });
	const { rates } = ratesOf({ ...o, ...layout });

	return Object.entries(Object.groupBy(groups, (g) => g.part)).map(([part, held = []]) => {
		const before = Array.from({ length: count }, () => 0n);
		const after = Array.from({ length: count }, () => 0n);

		held.forEach((g) => {
			const rate = rates(g.commodity);
			const yesterday = valuesOf(g.units, rate);
			const today = valuesOf([0n, ...g.units.slice(0, -1)], rate);

			today.forEach((now, i) => {
				const was = yesterday[i - 1];
				if (i === 0 || was == null || now == null) return;

				before[i] = (before[i] ?? 0n) + was;
				after[i] = (after[i] ?? 0n) + now;
			});
		});

		return { part, asset: held.some((g) => g.asset), before, after };
	});
};

/**
 * What the prices of one part's holdings added over the span, owing as it is
 * held.
 */
export type Shift = { account: string; amount: Amount };

type RateAt = (commodity: string, i: number) => bigint | null;

/**
 * What the prices of each part's holdings added over the span, as movesOf's
 * before and after add up, but found only where a holding's units change: in
 * between, the day by day moves cancel to units times the rate's change. A
 * commodity counts from the first day it has a price, which it keeps as the
 * latest quote carries forward.
 */
export const shiftsOf = (o: WorthOfOptions): Shift[] => {
	const layout = layoutOf(o);
	const groups = groupsOf({ ...o, ...layout });
	const { rateAt } = ratesOf({ ...o, ...layout });

	return Object.entries(Object.groupBy(groups, (g) => g.part)).map(([account, held = []]) => ({
		account,
		amount: held.reduce((t, g) => t + shiftOf(g, rateAt), 0n) as Amount,
	}));
};

const shiftOf = (g: Group, rateAt: RateAt) => {
	const last = g.units.length - 1;
	const priced = (i: number) => rateAt(g.commodity, i) !== null;
	if (g.commodity === DEFAULT_COMMODITY || !priced(last)) return 0n;

	const first = firstWhere(priced, { low: 0, high: last });
	const starts = changesOf(g.units);
	const rates = [...starts, last].map((i) => rateAt(g.commodity, Math.max(i, first)));

	return starts.reduce((t, i, n) => {
		const [then, now] = [rates[n], rates[n + 1]];
		const units = (g.units[i] ?? 0n) as Amount;
		if (then == null || now == null) return t;

		return t + multiply(units, now as Amount) - multiply(units, then as Amount);
	}, 0n);
};

/** The days a holding's units differ from the day before's, and the first. */
const changesOf = (u: bigint[]) => u.flatMap((x, i) => (i === 0 || x !== u[i - 1] ? [i] : []));

/** The first index in low to high where a test holds, which holds from there on. */
const firstWhere = (
	test: (i: number) => boolean,
	{ low, high }: { low: number; high: number },
): number => {
	if (low >= high) return low;

	const mid = Math.floor((low + high) / 2);
	return test(mid)
		? firstWhere(test, { low, high: mid })
		: firstWhere(test, { low: mid + 1, high });
};

type Span = { count: number; offsetOf: (year: number) => number };

const layoutOf = ({ from, to }: { from: Temporal.PlainDate; to: Temporal.PlainDate }): Span => ({
	count: from.until(to).days + 1,
	offsetOf: (y) => from.until(Temporal.PlainDate.from({ year: y, month: 1, day: 1 })).days,
});

type Held = { asset: boolean; part: string; commodity: string; years: BalanceYear[][] };

type Group = { asset: boolean; part: string; commodity: string; units: bigint[] };

/**
 * What each part holds of each commodity, assets and liabilities apart, as the
 * years of each account's balances that add up to it.
 */
const holdingsOf = ({ parts, balances }: { parts: PartOf[]; balances: BalanceYear[] }): Held[] => {
	const partOf = new Map(parts.map((p) => [p.accountId, p.part]));
	const byHolding = Object.values(Object.groupBy(balances, (b) => `${b.accountId} ${b.commodity}`));
	const held = new Map<string, Held>();

	byHolding.forEach((years = []) => {
		const first = years[0];
		const part = first && partOf.get(first.accountId);
		if (!first || part === undefined) return;

		const asset = first.accountType === AccountType.Assets;
		const key = `${asset} ${part} ${first.commodity}`;
		const group = held.get(key) ?? { asset, part, commodity: first.commodity, years: [] };
		held.set(key, group);
		group.years.push(years);
	});

	return [...held.values()];
};

/** What each part held of each commodity on each day. */
const groupsOf = ({
	parts,
	balances,
	count,
	offsetOf,
}: Span & { parts: PartOf[]; balances: BalanceYear[] }): Group[] =>
	holdingsOf({ parts, balances }).map(({ years, ...group }) => {
		const units = Array.from({ length: count }, () => 0n);
		years.forEach((h) =>
			dailyBalances(h, { count, offsetOf }).forEach((u, i) => {
				units[i] = (units[i] ?? 0n) + u;
			}),
		);

		return { ...group, units };
	});

type Placed = { offset: number; balances: Buffer }[];

/** A holding's years in order, each with the day of the span it starts on. */
const placedIn = (ys: BalanceYear[], { offsetOf }: Span): Placed =>
	ys
		.toSorted((a, b) => a.year - b.year)
		.map((y) => ({ offset: offsetOf(y.year), balances: y.balances }));

/**
 * What a holding held on one day: its latest year's balance on the day, or on
 * the year's last day once the year has run out, and nothing before its first.
 */
const unitsAt = (years: Placed, i: number) => {
	const year = years.findLast((y) => y.offset <= i);
	if (!year || lengthOf(year.balances) === 0) return 0n;

	return readDay(year.balances, Math.min(i - year.offset, lengthOf(year.balances) - 1));
};

const heldOn = (p: Placed[], i: number) => p.reduce((t, y) => t + unitsAt(y, i), 0n) as Amount;

/**
 * Lays a holding's years out over the span, each carrying on from its last day
 * until the next.
 */
const dailyBalances = (years: BalanceYear[], { count, offsetOf }: Span) => {
	const daily = Array.from({ length: count }, () => 0n);

	years
		.toSorted((a, b) => a.year - b.year)
		.forEach((y, at, sorted) => {
			const offset = offsetOf(y.year);
			const amounts = readSeries(y.balances);
			const next = sorted[at + 1];
			const end = Math.min(next ? offsetOf(next.year) : count, count);

			amounts.forEach((a, day) => {
				const i = offset + day;
				if (i >= 0 && i < count) daily[i] = a;
			});
			daily.fill(amounts.at(-1) ?? 0n, Math.max(offset + amounts.length, 0), Math.max(end, 0));
		});

	return daily;
};

const valuesOf = (units: bigint[], rates: (bigint | null)[] | null) =>
	units.map((u, i) => {
		if (u === 0n) return 0n;
		if (rates === null) return u;

		const rate = rates[i] ?? null;
		return rate === null ? null : multiply(u as Amount, rate as Amount);
	});

type RatesOptions = Span & {
	prices: PriceYear[];
	sources: PriceSources;
	opening: Record<string, Quantity>;
};

type QuoteRow = {
	offset: number;
	amounts: Buffer;
	priceCommodity: string;
	from: number;
	until: number;
};

type Quote = (commodity: string, i: number) => Quantity | null | undefined;

/**
 * Each commodity's rupees per unit: rates on every day, or rateAt on one. Both
 * carry the latest quote forward and reach rupees by the same hops.
 */
const ratesOf = ({ prices, sources, opening, count, offsetOf }: RatesOptions) => {
	const bySymbol = Map.groupBy(prices, (p) => p.symbolId);
	const ownOf = new Map(sources.own.map((s) => [s.symbol, s.id]));
	const linksOf = Map.groupBy(sources.links, (l) => l.alias);
	const indexOf = (date: string | null, none: number) => {
		if (date === null) return none;
		return Math.max(Math.min(dayIndex(date, offsetOf), count), 0);
	};

	const known = new Map<string, QuoteRow[]>();
	const rowsOf = (commodity: string) => {
		const rows = known.get(commodity);
		if (rows) return rows;

		const own = ownOf.get(commodity);
		const windows = [
			...(linksOf.get(commodity) ?? []).map((l) => ({
				symbolId: l.symbolId,
				from: indexOf(l.since, 0),
				until: indexOf(l.until, count),
			})),
			...(own ? [{ symbolId: own, from: 0, until: count }] : []),
		];
		const built = windows.flatMap((w) =>
			(bySymbol.get(w.symbolId) ?? []).map((p) => ({
				offset: offsetOf(p.year),
				amounts: p.amounts,
				priceCommodity: p.priceCommodity,
				from: w.from,
				until: w.until,
			})),
		);
		known.set(commodity, built);

		return built;
	};

	const timelines = new Map<string, (Quantity | null)[]>();
	const timelineOf = (commodity: string) => {
		const known = timelines.get(commodity);
		if (known) return known;

		const quoted: (Quantity | undefined)[] = Array.from({ length: count }, () => undefined);
		rowsOf(commodity).forEach((row) =>
			readSeries(row.amounts).forEach((a, day) => {
				const i = row.offset + day;
				if (a !== NO_AMOUNT && i >= row.from && i < row.until)
					quoted[i] = { amount: a as Amount, commodity: row.priceCommodity };
			}),
		);

		const carried = [opening[commodity] ?? null];
		const timeline = quoted.map((q) => {
			const latest = q ?? carried[0] ?? null;
			carried[0] = latest;
			return latest;
		});
		timelines.set(commodity, timeline);

		return timeline;
	};

	const quoteAt = (commodity: string, i: number) => {
		const latest = rowsOf(commodity)
			.flatMap((row) => {
				const quote = lastQuote(row, i);
				return quote ? [{ ...quote, commodity: row.priceCommodity }] : [];
			})
			.reduce<{ day: number; amount: Amount; commodity: string } | null>(
				(b, q) => (b === null || q.day >= b.day ? q : b),
				null,
			);

		return latest
			? { amount: latest.amount, commodity: latest.commodity }
			: (opening[commodity] ?? null);
	};

	const rates = new Map<string, (bigint | null)[]>();
	const rateOnDay = rateThrough((c, i) => timelineOf(c)[i]);

	return {
		rates: (commodity: string) => {
			if (commodity === DEFAULT_COMMODITY) return null;

			const known = rates.get(commodity);
			if (known) return known;

			const daily = Array.from({ length: count }, (_, i) => rateOnDay(commodity, i));
			rates.set(commodity, daily);

			return daily;
		},
		rateAt: rateThrough(quoteAt),
	};
};

/**
 * Rupees per unit through at most HOPS quotes, rounding each step as multiply
 * does, or null when a commodity has no quote on the day.
 */
const rateThrough = (quote: Quote) => {
	const rateOn = (i: number, commodity: string, rate: bigint, hops: number): bigint | null => {
		if (commodity === DEFAULT_COMMODITY) return rate;
		if (hops === HOPS) return null;

		const price = quote(commodity, i);
		if (!price) return null;

		return rateOn(i, price.commodity, multiply(rate as Amount, price.amount), hops + 1);
	};

	return (c: string, i: number) => rateOn(i, c, AMOUNT_UNIT, 0);
};

/**
 * The latest quote in a year's row on or before a day, and the day it was for,
 * inside the row's window.
 */
const lastQuote = (row: QuoteRow, i: number) => {
	const first = Math.max(row.from - row.offset, 0);
	const last = Math.min(i, row.until - 1, row.offset + lengthOf(row.amounts) - 1) - row.offset;

	return quoteBefore(row, { slot: last, first });
};

const quoteBefore = (row: QuoteRow, { slot, first }: { slot: number; first: number }) => {
	if (slot < first) return null;

	const amount = readDay(row.amounts, slot);
	if (amount !== NO_AMOUNT) return { day: row.offset + slot, amount: amount as Amount };

	return quoteBefore(row, { slot: slot - 1, first });
};

const dayIndex = (date: string, offsetOf: (year: number) => number) => {
	if (date === '-infinity') return Number.NEGATIVE_INFINITY;
	if (date === 'infinity') return Number.POSITIVE_INFINITY;

	const day = Temporal.PlainDate.from(date);
	return offsetOf(day.year) + day.dayOfYear - 1;
};

/**
 * Each part's worth that is not nothing, or each commodity's when worth is
 * divided by commodity.
 */
const sharesOf = (
	groups: { part: string; commodity: string; value: bigint | null }[],
	byCommodity: boolean,
) => {
	const shares = new Map<string, Worth['parts'][number]>();
	groups.forEach((g) => {
		const commodity = byCommodity ? g.commodity : null;
		const key = `${g.part} ${commodity}`;
		const amount = (shares.get(key)?.amount ?? 0n) + (g.value ?? 0n);
		shares.set(key, { account: g.part, commodity, amount: amount as Amount });
	});

	return [...shares.values()].filter((s) => s.amount !== 0n);
};

/**
 * Every day of a short span; of a long one, each stretch's lowest and highest
 * in order, and the first and last, which the chart reads its change from.
 */
export const shownDays = <T extends number | bigint>(worth: T[]) => {
	if (worth.length <= MOST_DAYS) return worth.map((_, i) => i);

	const stretch = Math.ceil(worth.length / (MOST_DAYS / 2));
	const starts = Array.from({ length: Math.ceil(worth.length / stretch) }, (_, n) => n * stretch);
	const shown = starts.flatMap((start) => {
		const days = worth.slice(start, start + stretch);
		const lowest = days.reduce((l, w, i) => (w < (days[l] ?? w) ? i : l), 0);
		const highest = days.reduce((h, w, i) => (w > (days[h] ?? w) ? i : h), 0);

		return [start + lowest, start + highest];
	});

	return [...new Set([0, ...shown, worth.length - 1])].toSorted((a, b) => a - b);
};
