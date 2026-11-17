import { bucketKeyOf, type Bucket } from '@rupea/shared/balances.ts';
import { multiply, type Amount } from './amounts';
import { lotKeyOf, type Costed, type Lots } from './closings-lots';
import type { Delta } from './deltas';

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

type ClosingsOptions = {
	base: string;
	bucket: Bucket;
	ends: Temporal.PlainDate[];
	lots?: Record<string, Lots>;
	/** A commodity's rate in the base on each valuation day, in step with ends. */
	ratesFor: (commodity: string) => (bigint | null)[];
};

/**
 * What each holding stood at on the last day of each bucket: its opening and
 * every gain up to then as units, valued with the rate of its valuation day,
 * and what its lots had cost in the base at that rate and at the rates of the
 * days they were paid for. A holding with units and no rate counts nothing and
 * is one unpriced, and so is one whose cost had no rate or whose lots were paid
 * for with none; a row counts a holding once, and the holdings that went
 * unpriced come back beside the rows.
 */
export const closingsOf = (
	holdings: Holding[],
	{ base, bucket, ends, lots = {}, ratesFor }: ClosingsOptions,
): { rows: Delta[]; unpriced: Holding[] } => {
	const keys = ends.map(bucketKeyOf[bucket]);
	const order = new Map(keys.map((k, n) => [k, n]));
	const costed = Object.values(lots).flatMap((l) => Object.keys(l.costs));
	const rates = new Map(
		[...new Set([...holdings.map((h) => h.commodity), ...costed])]
			.filter((c) => c !== base)
			.map((c) => [c, ratesFor(c)]),
	);
	const prices = new Map(
		[...rates].map(([c, r]) => [c, r.map((x) => (x === null ? null : quoted(x, base)))]),
	);
	const unpriced = new Set<Holding>();

	const rows = holdings.flatMap((h) => {
		const lot = lots[lotKeyOf(h.account, h.commodity)];
		const units = runningOf(h, order);
		const rateOn = rates.get(h.commodity);
		const values = rateOn ? valuesOf(units, rateOn) : units;
		const paid = lot ? runningOf(lot.paid, order) : [];
		const costs = Object.entries(lot?.costs ?? {}).map(
			([c, k]) => [c, runningOf(k, order)] as const,
		);
		const priceOn = prices.get(h.commodity);

		return keys.map((key, n) => {
			const value = values[n] ?? null;
			const cost = costs.length ? costOf(costs, { n, base, rates }) : 0n;
			const failed = value === null || cost === null || (lot?.unpriced.size ?? 0) > 0;
			if (failed) unpriced.add(h);

			return {
				account: h.account,
				commodity: h.commodity,
				bucket: key,
				value: (value ?? 0n) as Amount,
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
 * Units valued at each day's rate, or null with units and no rate. A day
 * unchanged keeps the last value.
 */
const valuesOf = (units: Amount[], rates: (bigint | null)[]) => {
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
