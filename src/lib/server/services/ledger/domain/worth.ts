import { AMOUNT_UNIT, DEFAULT_COMMODITY, multiply, type Amount, type Quantity } from './amounts';
import { HOPS } from './holdings';
import { NO_AMOUNT, readSeries } from './series';
import { AccountType } from './types';

/** Up to this many days are all shown; beyond it each stretch shows its lowest and highest. */
const MOST_DAYS = 1000;

/** What balance accounts were worth in rupees at the end of one day, owing below zero as the accounts hold it, and how many commodities had no price. */
export type Worth = {
	day: Temporal.PlainDate;
	assets: Amount;
	liabilities: Amount;
	worth: Amount;
	/** What each part was worth: an account, or one commodity it holds when worth is divided by commodity. */
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

/** Where a commodity's prices come from: a ledger's own symbol, or a feed's while a link holds. */
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

type WorthOfOptions = {
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
 * Each day values its balances at the latest price on or before it, reaching rupees in at most
 * two prices and rounding each step as multiply does, and each part's balances are added before
 * they are valued. Long spans keep each stretch's lowest and highest days, and the last.
 */
export const worthOf = (o: WorthOfOptions): Worth[] => {
	const count = o.from.until(o.to).days + 1;
	const offsetOf = (y: number) =>
		o.from.until(Temporal.PlainDate.from({ year: y, month: 1, day: 1 })).days;
	const groups = groupsOf({ ...o, count, offsetOf });
	const rates = ratesOf({ ...o, count, offsetOf });
	const values = groups.map((g) => valuesOf(g.units, rates(g.commodity)));
	const worth = Array.from({ length: count }, () => 0n);
	values.forEach((v) =>
		v.forEach((x, i) => {
			if (x !== null) worth[i] = (worth[i] ?? 0n) + x;
		}),
	);

	return shownDays(worth).map((i) => {
		const counted = groups.map((g, n) => ({
			...g,
			value: values[n]?.[i] ?? null,
			held: g.units[i],
		}));
		const priced = counted.filter((g) => g.value !== null);
		const sumOf = (g: typeof priced) => g.reduce((t, x) => t + (x.value ?? 0n), 0n) as Amount;
		const unpriced = counted.filter((g) => g.value === null && g.held !== 0n);

		return {
			day: o.from.add({ days: i }),
			assets: sumOf(priced.filter((g) => g.asset)),
			liabilities: sumOf(priced.filter((g) => !g.asset)),
			worth: sumOf(priced),
			parts: sharesOf(priced, o.byCommodity),
			unpriced: new Set(unpriced.map((g) => g.commodity)).size,
		};
	});
};

type Span = { count: number; offsetOf: (year: number) => number };

type Group = { asset: boolean; part: string; commodity: string; units: bigint[] };

/** What each part held of each commodity on each day, assets and liabilities apart. */
const groupsOf = ({
	parts,
	balances,
	count,
	offsetOf,
}: Span & { parts: PartOf[]; balances: BalanceYear[] }): Group[] => {
	const partOf = new Map(parts.map((p) => [p.accountId, p.part]));
	const held = Object.values(Object.groupBy(balances, (b) => `${b.accountId} ${b.commodity}`));
	const groups = new Map<string, Group>();

	held.forEach((years = []) => {
		const first = years[0];
		const part = first && partOf.get(first.accountId);
		if (!first || part === undefined) return;

		const asset = first.accountType === AccountType.Assets;
		const key = `${asset} ${part} ${first.commodity}`;
		const group = groups.get(key) ?? {
			asset,
			part,
			commodity: first.commodity,
			units: Array.from({ length: count }, () => 0n),
		};
		groups.set(key, group);

		const daily = dailyBalances(years, { count, offsetOf });
		daily.forEach((u, i) => {
			group.units[i] = (group.units[i] ?? 0n) + u;
		});
	});

	return [...groups.values()];
};

/** Lays a holding's years out over the span, each carrying on from its last day until the next. */
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

/** Each commodity's rupees per unit on each day, or null for rupees themselves. */
const ratesOf = ({ prices, sources, opening, count, offsetOf }: RatesOptions) => {
	const bySymbol = Map.groupBy(prices, (p) => p.symbolId);
	const ownOf = new Map(sources.own.map((s) => [s.symbol, s.id]));
	const linksOf = Map.groupBy(sources.links, (l) => l.alias);
	const quotedOn = (
		symbolId: string,
		onto: (Quantity | undefined)[],
		from: number,
		until: number,
	) =>
		(bySymbol.get(symbolId) ?? []).forEach((p) => {
			const offset = offsetOf(p.year);
			readSeries(p.amounts).forEach((a, day) => {
				const i = offset + day;
				if (a !== NO_AMOUNT && i >= from && i < until)
					onto[i] = { amount: a as Amount, commodity: p.priceCommodity };
			});
		});
	const indexOf = (date: string | null, none: number) => {
		if (date === null) return none;
		return Math.max(Math.min(dayIndex(date, offsetOf), count), 0);
	};

	const timelines = new Map<string, (Quantity | null)[]>();
	const timelineOf = (commodity: string) => {
		const known = timelines.get(commodity);
		if (known) return known;

		const quoted: (Quantity | undefined)[] = Array.from({ length: count }, () => undefined);
		(linksOf.get(commodity) ?? []).forEach((l) =>
			quotedOn(l.symbolId, quoted, indexOf(l.since, 0), indexOf(l.until, count)),
		);
		const own = ownOf.get(commodity);
		if (own) quotedOn(own, quoted, 0, count);

		const carried = [opening[commodity] ?? null];
		const timeline = quoted.map((q) => {
			const latest = q ?? carried[0] ?? null;
			carried[0] = latest;
			return latest;
		});
		timelines.set(commodity, timeline);

		return timeline;
	};

	const rateOn = (i: number, commodity: string, rate: bigint, hops: number): bigint | null => {
		if (commodity === DEFAULT_COMMODITY) return rate;
		if (hops === HOPS) return null;

		const price = timelineOf(commodity)[i];
		if (!price) return null;

		return rateOn(i, price.commodity, multiply(rate as Amount, price.amount), hops + 1);
	};

	const rates = new Map<string, (bigint | null)[]>();

	return (commodity: string) => {
		if (commodity === DEFAULT_COMMODITY) return null;

		const known = rates.get(commodity);
		if (known) return known;

		const daily = Array.from({ length: count }, (_, i) => rateOn(i, commodity, AMOUNT_UNIT, 0));
		rates.set(commodity, daily);

		return daily;
	};
};

const dayIndex = (date: string, offsetOf: (year: number) => number) => {
	if (date === '-infinity') return Number.NEGATIVE_INFINITY;
	if (date === 'infinity') return Number.POSITIVE_INFINITY;

	const day = Temporal.PlainDate.from(date);
	return offsetOf(day.year) + day.dayOfYear - 1;
};

/** Each part's worth that is not nothing, or each commodity's when worth is divided by commodity. */
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

/** Every day of a short span; of a long one, each stretch's lowest and highest in order, and the first and last, which the chart reads its change from. */
const shownDays = (worth: bigint[]) => {
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
