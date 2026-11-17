import { dayNumberOf, isoDateOf } from '#lib/server/shared/dates.ts';
import type { Bucket, Measure } from '@rupea/shared/balances.ts';
import type { Span } from '@rupea/shared/dates.ts';
import { AMOUNT_UNIT, multiply, type Amount, type Quantity } from './amounts';
import { lotKeyOf, type Costed, type Lots } from './closings-lots';
import type { Delta, Series } from './deltas';

/**
 * What one account held of one commodity before a span, and what it gained of
 * it in each bucket, by the bucket's key. A bucket it gained nothing in has no
 * key.
 */
export type Holding = {
	account: string;
	commodity: string;
	opening: Amount;
	gains: Record<string, Amount>;
};

type Gained = { accountId: string; commodity: string; units: Amount };

/**
 * The holdings that these openings and gains name, by the name of each account.
 * A holding that is only in the openings, or only in the gains, is one too.
 */
export const holdingsOf = (
	{ openings, gains }: { openings: Gained[]; gains: (Gained & { bucket: string })[] },
	names: Record<string, string>,
): Holding[] => {
	const held = new Map<string, Holding>();
	const holdingOf = (r: Gained) =>
		held.getOrInsertComputed(`${r.accountId} ${r.commodity}`, () => ({
			account: names[r.accountId] ?? r.accountId,
			commodity: r.commodity,
			opening: 0n as Amount,
			gains: {},
		}));

	openings.forEach((o) => (holdingOf(o).opening = o.units));
	gains.forEach((g) => (holdingOf(g).gains[g.bucket] = g.units));

	return [...held.values()];
};

const KEY_LENGTH = { date: 10, month: 7, year: 4 };

type Closes = { keys: string[]; days: number[] };

/** Every day of a span, counted in days from the span's start, with no keys. */
export const daysOf = ({ from, to }: Span): Closes => ({
	keys: [],
	days: Array.from({ length: from.until(to).days + 1 }, (_, n) => n),
});

/**
 * The last day of each bucket of a span, cut short at the span's end: its key,
 * and how many days it is from the span's start.
 */
export const closesOf = ({ from, to }: Span, bucket: Exclude<Bucket, 'day'>): Closes => {
	const first = dayNumberOf(from);
	const last = dayNumberOf(to);
	const lasts = {
		date: () => Array.from({ length: last - first + 1 }, (_, n) => first + n),
		month: () =>
			Array.from({ length: (to.year - from.year) * 12 + to.month - from.month + 1 }, (_, n) =>
				Math.min(dayNumberOf({ year: from.year, month: from.month + n + 1, day: 0 }), last),
			),
		year: () =>
			Array.from({ length: to.year - from.year + 1 }, (_, n) =>
				Math.min(dayNumberOf({ year: from.year + n + 1, month: 1, day: 0 }), last),
			),
	}[bucket]();

	return {
		keys: lasts.map((d) => isoDateOf(d).slice(0, KEY_LENGTH[bucket])),
		days: lasts.map((d) => d - first),
	};
};

type ClosingsOptions = {
	base: string;
	keys: string[];
	measures: Measure[];
	lots?: Record<string, Lots>;
	/** A commodity's rate in the base on each valuation day, in step with keys. */
	ratesFor: (commodity: string) => (bigint | null)[];
};

/**
 * What each holding stood at on the last day of each bucket: its opening and
 * every gain up to then as units, valued with the rate of its valuation day,
 * and what its lots had cost in the base at that rate and at the rates of the
 * days they were paid for. A holding with units and no rate counts nothing and
 * is one unpriced, and so is one whose cost had no rate or whose lots were paid
 * for with none; a row counts a holding once, and the holdings that went
 * unpriced come back beside the rows. A value or price nobody asked for is left
 * alone.
 */
export const closingsOf = (
	holdings: Holding[],
	{ base, keys, measures, lots = {}, ratesFor }: ClosingsOptions,
): { rows: Delta[]; unpriced: Holding[] } => {
	const order = new Map(keys.map((k, n) => [k, n]));
	const costed = Object.values(lots).flatMap((l) => Object.keys(l.costs));
	const rates = new Map(
		[...new Set([...holdings.map((h) => h.commodity), ...costed])]
			.filter((c) => c !== base)
			.map((c) => [c, ratesFor(c)]),
	);
	const prices = new Map(
		[...rates].map(([c, r]) => [c, measures.includes('price') ? pricesOf(r, base) : []]),
	);
	const unpriced = new Set<Holding>();

	const rows = holdings.flatMap((h) => {
		const lot = lots[lotKeyOf(h.account, h.commodity)];
		const units = runningOf(h, order);
		const rateOn = rates.get(h.commodity);
		const values = measures.includes('value') ? valuesOf(units, rateOn) : [];
		const paid = lot ? runningOf(lot.paid, order) : [];
		const costs = Object.entries(lot?.costs ?? {}).map(
			([c, k]) => [c, runningOf(k, order)] as const,
		);
		const priceOn = prices.get(h.commodity);

		return keys.map((key, n) => {
			const cost = costs.length ? costOf(costs, { n, base, rates }) : 0n;
			const unrated = rateOn !== undefined && units[n] !== 0n && (rateOn[n] ?? null) === null;
			const failed = unrated || cost === null || (lot?.unpriced.size ?? 0) > 0;
			if (failed) unpriced.add(h);

			return {
				account: h.account,
				commodity: h.commodity,
				bucket: key,
				value: (values[n] ?? 0n) as Amount,
				inflow: 0n as Amount,
				outflow: 0n as Amount,
				units: units[n] as Amount,
				cost: (cost ?? 0n) as Amount,
				paid: paid[n] ?? (0n as Amount),
				price: priceOn?.[n] ?? null,
				unpriced: failed ? 1 : 0,
			};
		});
	});

	return { rows, unpriced: [...unpriced] };
};

type SeriesOptions = {
	base: string;
	span: Span;
	ratesFor: (commodity: string) => (bigint | null)[];
};

const SCALE = Number(AMOUNT_UNIT);

/**
 * The units and price of each holding on every day from the first, as floats,
 * and the holdings that had units on a day with no price. A commodity's price
 * is one array shared by the holdings of it.
 */
export const seriesOf = (
	holdings: Holding[],
	{ base, span, ratesFor }: SeriesOptions,
): { series: Series[]; unpriced: Holding[] } => {
	const count = span.from.until(span.to).days + 1;
	const first = dayNumberOf(span.from);
	const prices = new Map<string, Float64Array>();
	const priceOn = (c: string) =>
		prices.getOrInsertComputed(c, () =>
			c === base ? new Float64Array(count).fill(1) : pricesFrom(ratesFor(c), count),
		);

	const series = holdings.map((h) => ({
		account: h.account,
		commodity: h.commodity,
		units: unitsOn(h, { first, count }),
		prices: priceOn(h.commodity),
	}));
	const unpriced = holdings.filter((_, i) => {
		const s = series[i];
		return (
			s?.prices.some(Number.isNaN) && s.units.some((u, d) => u !== 0 && Number.isNaN(s.prices[d]))
		);
	});

	return { series, unpriced };
};

/**
 * Rates as floats, with no rate as NaN, and one conversion to the days that
 * share a rate.
 */
const pricesFrom = (rates: (bigint | null)[], count: number) => {
	const prices = new Float64Array(count);
	const last: { rate: bigint | null; price: number } = { rate: null, price: Number.NaN };

	for (const i of prices.keys()) {
		const r = rates[i] ?? null;
		if (r !== last.rate) {
			last.rate = r;
			last.price = r === null ? Number.NaN : Number(r) / SCALE;
		}
		prices[i] = last.price;
	}

	return prices;
};

/** The opening plus the gains up to each day from the first, as floats. */
const unitsOn = (
	{ opening, gains }: Holding,
	{ first, count }: { first: number; count: number },
) => {
	const units = new Float64Array(count).fill(Number(opening) / SCALE);
	const moves = Object.entries(gains)
		.map(([key, gain]) => ({ at: dayNumberOf(key) - first, gain }))
		.toSorted((a, b) => a.at - b.at);

	moves.reduce((held, move, i) => {
		const now = (held + move.gain) as Amount;
		units.fill(Number(now) / SCALE, move.at, moves[i + 1]?.at ?? count);
		return now;
	}, opening);

	return units;
};

/** A rate as a price, one price to the days that share a rate. */
const pricesOf = (rates: (bigint | null)[], base: string) => {
	const last: { rate: bigint | null; price: Quantity | null } = { rate: null, price: null };

	return rates.map((r) => {
		if (r === last.rate) return last.price;

		last.rate = r;
		last.price = r === null ? null : quoted(r, base);

		return last.price;
	});
};

const quoted = (r: bigint, b: string) => ({ amount: r as Amount, commodity: b });

/** The opening plus the gains up to each bucket, in the order of the keys. */
const runningOf = ({ opening, gains }: Costed, order: Map<string, number>) => {
	const totals = new Array<Amount>(order.size).fill(opening);
	const moves = Object.entries(gains)
		.flatMap(([key, gain]) => {
			const at = order.get(key);
			return at === undefined ? [] : [{ at, gain }];
		})
		.toSorted((a, b) => a.at - b.at);

	moves.reduce((held, move, i) => {
		const now = (held + move.gain) as Amount;
		totals.fill(now, move.at, moves[i + 1]?.at ?? order.size);
		return now;
	}, opening);

	return totals;
};

/**
 * Units valued at each day's rate, or null with units and no rate, and the
 * units themselves for the base, which has no rates. A day unchanged keeps the
 * last value.
 */
const valuesOf = (units: Amount[], rates: (bigint | null)[] | undefined) => {
	if (!rates) return units;

	const values: (Amount | null)[] = [];
	units.forEach((u, n) => {
		const same = n > 0 && u === units[n - 1] && rates[n] === rates[n - 1];
		values.push(same ? (values[n - 1] ?? null) : valued(u, rates[n] ?? null));
	});

	return values;
};

type CostOfOptions = { n: number; base: string; rates: Map<string, (bigint | null)[]> };

/**
 * What the costs held at bucket n come to in the base, or null for one with no
 * rate.
 */
const costOf = (costs: (readonly [string, Amount[]])[], { n, base, rates }: CostOfOptions) => {
	const converted = costs.map(([c, totals]) => {
		const total = totals[n] ?? (0n as Amount);
		const rate = rates.get(c)?.[n] ?? null;
		if (total === 0n || c === base) return total;
		return valued(total, rate);
	});

	return converted.includes(null) ? null : converted.reduce((t, c) => t! + c!, 0n);
};

const valued = (u: Amount, r: bigint | null) => {
	if (u === 0n) return u;
	return r === null ? null : (multiply(u, r as Amount) as Amount);
};
