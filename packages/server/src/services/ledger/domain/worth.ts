import { dayNumberOf } from '#lib/server/shared/dates.ts';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, multiply, type Amount, type Quantity } from './amounts';
import { lengthOf, NO_AMOUNT, readDay, readSeries } from './series';

/**
 * Up to this many days are all shown; beyond it each stretch shows its lowest
 * and highest.
 */
const MOST_DAYS = 1000;

/** The part an account's balances count towards. */
export type PartOf = { accountId: string; part: string };

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
type RatesOnOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	prices: PriceYear[];
	sources: PriceSources;
	opening: Record<string, Quantity>;
};

/**
 * What a unit of a commodity is worth in rupees on each of these days, counted
 * from the first, in step with them and priced as the day by day walk prices
 * it, or null with no price. The days are where the valuation happens, so they
 * need not be bucket ends. Many days are read from every day's rate at once,
 * and a few from the quotes alone.
 */
export const ratesOn = (o: RatesOnOptions, days: number[]) => {
	const layout = layoutOf(o);

	if (days.length * 2 > layout.count) {
		const every = ratesEvery({ ...o, count: layout.count });

		return (c: string): (bigint | null)[] => {
			const series = every(c);
			return days.map((i) => series[i] ?? null);
		};
	}

	const { rateAt } = ratesOf({ ...o, ...layout });

	return (c: string): (bigint | null)[] => days.map((i) => rateAt(c, i));
};

type RatesEveryOptions = {
	from: Temporal.PlainDate;
	count: number;
	prices: PriceYear[];
	sources: PriceSources;
	opening: Record<string, Quantity>;
};

type Timeline = { amounts: bigint[]; quoted: Int16Array };

/** How many quotes a price may hop through to reach the base. */
export const HOPS = 2;

const NOT_QUOTED = -1;

/**
 * Each commodity's rupees per unit on every day of a span, read straight from
 * the price years without a date for each day. A day with no quote carries the
 * latest one forward from the opening price, and rupees are reached by the same
 * hops as rateAt, rounding each step as multiply does.
 */
const ratesEvery = ({ prices, sources, opening, from, count }: RatesEveryOptions) => {
	const first = dayNumberOf(from);
	const offsetOf = (y: number) => dayNumberOf({ year: y, month: 1, day: 1 }) - first;
	const indexOf = (date: string | null, none: number) => {
		if (date === null) return none;
		if (date === '-infinity') return 0;
		if (date === 'infinity') return count;

		return Math.max(Math.min(dayNumberOf(date) - first, count), 0);
	};

	const bySymbol = Map.groupBy(prices, (p) => p.symbolId);
	const ownOf = new Map(sources.own.map((s) => [s.symbol, s.id]));
	const linksOf = Map.groupBy(sources.links, (l) => l.alias);
	const names: string[] = [];
	const ids = new Map<string, number>();
	const idOf = (c: string) => ids.getOrInsertComputed(c, () => names.push(c) - 1);

	const paint = (w: { symbolId: string; from: number; until: number }, t: Timeline) => {
		for (const p of bySymbol.get(w.symbolId) ?? []) {
			const offset = offsetOf(p.year);
			const id = idOf(p.priceCommodity);

			for (const [day, a] of readSeries(p.amounts).entries()) {
				const i = offset + day;
				if (a === NO_AMOUNT || i < w.from || i >= w.until) continue;

				t.amounts[i] = a;
				t.quoted[i] = id;
			}
		}
	};

	const timelines = new Map<string, Timeline>();
	const timelineOf = (commodity: string) =>
		timelines.getOrInsertComputed(commodity, () => {
			const own = ownOf.get(commodity);
			const windows = [
				...(linksOf.get(commodity) ?? []).map((l) => ({
					symbolId: l.symbolId,
					from: indexOf(l.since, 0),
					until: indexOf(l.until, count),
				})),
				...(own ? [{ symbolId: own, from: 0, until: count }] : []),
			];
			const amounts = new Array<bigint>(count).fill(0n);
			const quoted = new Int16Array(count).fill(NOT_QUOTED);

			for (const w of windows) paint(w, { amounts, quoted });

			const open = opening[commodity];
			const carried = {
				amount: open?.amount ?? 0n,
				quote: open ? idOf(open.commodity) : NOT_QUOTED,
			};
			quoted.forEach((q, i) => {
				if (q === NOT_QUOTED) {
					amounts[i] = carried.amount;
					quoted[i] = carried.quote;
					return;
				}

				carried.amount = amounts[i] ?? 0n;
				carried.quote = q;
			});

			return { amounts, quoted };
		});

	const series = new Map<string, (bigint | null)[]>();
	const rateThrough = (commodity: string, hops: number): (bigint | null)[] =>
		series.getOrInsertComputed(`${commodity} ${hops}`, () => {
			if (commodity === DEFAULT_COMMODITY) return new Array(count).fill(AMOUNT_UNIT);
			if (hops === 0) return new Array(count).fill(null);

			const { amounts, quoted } = timelineOf(commodity);
			const onward = new Map<number, (bigint | null)[]>();
			const last = {
				quote: NOT_QUOTED,
				amount: 0n,
				onward: null as bigint | null,
				rate: null as bigint | null,
			};

			const rates = new Array<bigint | null>(count).fill(null);

			for (const i of quoted.keys()) {
				const q = quoted[i] ?? NOT_QUOTED;
				if (q === NOT_QUOTED) continue;

				const further =
					onward.getOrInsertComputed(q, () => rateThrough(names[q] ?? '', hops - 1))[i] ?? null;
				const amount = amounts[i] ?? 0n;
				if (q === last.quote && amount === last.amount && further === last.onward) {
					rates[i] = last.rate;
					continue;
				}

				last.quote = q;
				last.amount = amount;
				last.onward = further;
				last.rate = rateOf(amount, further);
				rates[i] = last.rate;
			}

			return rates;
		});

	return (c: string) => rateThrough(c, HOPS);
};

/**
 * What an amount quoted in a currency comes to in rupees, with the rate of the
 * currency; a quote in rupees needs no multiplying.
 */
const rateOf = (amount: bigint, onward: bigint | null) => {
	if (onward === null) return null;
	if (onward === AMOUNT_UNIT) return amount;

	return multiply(amount as Amount, onward as Amount);
};
type Span = { count: number; offsetOf: (year: number) => number };

const layoutOf = ({ from, to }: { from: Temporal.PlainDate; to: Temporal.PlainDate }): Span => ({
	count: from.until(to).days + 1,
	offsetOf: (y) => from.until(Temporal.PlainDate.from({ year: y, month: 1, day: 1 })).days,
});

type RatesOptions = {
	count: number;
	offsetOf: (year: number) => number;
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
 * Each commodity's rupees per unit on one day, carrying the latest quote
 * forward and reaching rupees by the hops.
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

	const quoteAt = (commodity: string, i: number) => {
		const latest = rowsOf(commodity).reduce<{
			day: number;
			amount: Amount;
			commodity: string;
		} | null>((best, row) => {
			const quote = lastQuote(row, i);
			if (!quote || (best !== null && quote.day < best.day)) return best;

			return { ...quote, commodity: row.priceCommodity };
		}, null);

		return latest
			? { amount: latest.amount, commodity: latest.commodity }
			: (opening[commodity] ?? null);
	};

	return { rateAt: rateThrough(quoteAt) };
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
