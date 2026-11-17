import { multiply, type Amount } from './amounts';
import type { RateThen } from './cost';

/**
 * What one holding's lots had cost before a span and took in or gave up in each
 * bucket, by the bucket's key.
 */
export type Costed = { opening: Amount; gains: Record<string, Amount> };

/**
 * The lots of one holding: what they cost in rupees at the prices of the days
 * they were paid for, what they cost in the commodity each cost in, and the
 * cost commodities that had no price on such a day.
 */
export type Lots = { paid: Costed; costs: Record<string, Costed>; unpriced: Set<string> };

type CostRow = {
	accountId: string;
	commodity: string;
	cost: string;
	paid: Temporal.PlainDate;
	amount: Amount;
};

type LotsOfOptions = {
	names: Record<string, string>;
	base: string;
	bought: RateThen[];
	paid: boolean;
};

/** The key of a holding in the lots, by the name of its account. */
export const lotKeyOf = (a: string, c: string) => `${a} ${c}`;

/**
 * The lots each holding has, from what they cost before a span and in each of
 * its buckets. A cost in another commodity is valued at the rate of the day the
 * lot was paid for, and counts nothing when that day had none, which is
 * remembered only when paid is asked.
 */
export const lotsOf = (
	{ openings, gains }: { openings: CostRow[]; gains: (CostRow & { bucket: string })[] },
	{ names, base, bought, paid }: LotsOfOptions,
): Record<string, Lots> => {
	const rates = new Map(bought.map((r) => [`${r.commodity} ${r.day}`, r.rate]));
	const lots: Record<string, Lots> = {};

	for (const row of [...openings.map((o) => ({ ...o, bucket: null })), ...gains]) {
		const lot = (lots[lotKeyOf(names[row.accountId] ?? row.accountId, row.commodity)] ??= {
			paid: nothing(),
			costs: {},
			unpriced: new Set(),
		});
		const rate = rates.get(`${row.cost} ${row.paid}`);

		addTo(lot.paid, row.bucket, rupeesOf(row, { base, rate }));
		addTo((lot.costs[row.cost] ??= nothing()), row.bucket, row.amount);
		if (paid && row.cost !== base && rate === undefined) lot.unpriced.add(row.cost);
	}

	return lots;
};

/** The cost commodities that had no price on a day a lot was paid for. */
export const unpricedCostsIn = (l: Record<string, Lots>): string[] =>
	[...new Set(Object.values(l).flatMap((x) => [...x.unpriced]))].toSorted();

const nothing = (): Costed => ({ opening: 0n as Amount, gains: {} });

const addTo = (c: Costed, bucket: string | null, amount: Amount) => {
	if (bucket === null) c.opening = (c.opening + amount) as Amount;
	if (bucket !== null) c.gains[bucket] = ((c.gains[bucket] ?? 0n) + amount) as Amount;
};

const rupeesOf = (row: CostRow, { base, rate }: { base: string; rate: Amount | undefined }) => {
	if (row.cost === base) return row.amount;
	return rate === undefined ? (0n as Amount) : (multiply(row.amount, rate) as Amount);
};
