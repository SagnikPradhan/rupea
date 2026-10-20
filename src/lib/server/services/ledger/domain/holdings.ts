import { DEFAULT_COMMODITY, multiply, sum, type Amount, type Quantity } from './amounts';
import { hasLots } from './lots';

export const HOPS = 2;

/** Units held now in one account, and what its open lots cost in all, when that is one commodity. */
export type Holding = { account: string; commodity: string; units: Amount; cost: Quantity | null };

export type ValuedHolding = {
	account: string;
	commodity: string;
	units: Amount;
	cost: Quantity | null;
	hasLots: boolean;
	price: Quantity | null;
	value: Amount | null;
	gain: Amount | null;
};

/** The commodities holdings need a price for: their own, and what their lots cost in. */
export const pricedIn = (hs: Holding[]) => [
	...new Set(hs.flatMap((h) => (h.cost ? [h.commodity, h.cost.commodity] : [h.commodity]))),
];

export const valued = (holding: Holding, prices: Record<string, Quantity>): ValuedHolding => {
	const worth = inRupees({ amount: holding.units, commodity: holding.commodity }, prices, HOPS);
	const paid = holding.cost && inRupees(holding.cost, prices, HOPS);

	return {
		...holding,
		hasLots: hasLots(holding.commodity),
		price: prices[holding.commodity] ?? null,
		value: worth,
		gain: worth === null || paid === null ? null : ((worth - paid) as Amount),
	};
};

export type Account = {
	account: string;
	depth: number;
	holdings: ValuedHolding[];
	total: Amount;
	unpriced: number;
};

export const accountTree = (holdings: ValuedHolding[]): Account[] =>
	[...new Set(holdings.flatMap((h) => ancestors(h.account)))]
		.toSorted(inTreeOrder)
		.map((account) => {
			const within = holdings.filter(
				(h) => h.account === account || h.account.startsWith(`${account}:`),
			);
			return {
				account,
				depth: account.split(':').length - 1,
				holdings: within.filter((h) => h.account === account),
				total: sum(within.map((h) => h.value ?? (0n as Amount))),
				unpriced: within.filter((h) => h.value === null).length,
			};
		});

const inRupees = (
	quantity: Quantity,
	prices: Record<string, Quantity>,
	hops: number,
): Amount | null => {
	if (quantity.commodity === DEFAULT_COMMODITY) return quantity.amount;

	const price = prices[quantity.commodity];
	const rate = price && hops > 0 ? inRupees(price, prices, hops - 1) : null;
	return rate === null ? null : multiply(quantity.amount, rate);
};

const ancestors = (a: string) => a.split(':').map((_, i, s) => s.slice(0, i + 1).join(':'));

const inTreeOrder = (a: string, b: string) => {
	const left = a.split(':');
	const right = b.split(':');
	const differs = left.findIndex((s, i) => s !== right[i]);
	if (differs === -1) return left.length - right.length;

	return (left[differs] ?? '').localeCompare(right[differs] ?? '');
};
