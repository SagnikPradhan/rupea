import { DEFAULT_COMMODITY, multiply, sum, type Amount, type Quantity } from './amounts';
import { hasLots } from './lots';
import { byPath, parentsOf } from './taxonomy';

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
	paid: Amount | null;
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
		paid,
		gain: worth === null || paid === null ? null : ((worth - paid) as Amount),
	};
};

export type Account = {
	account: string;
	/** What the account holds itself, rupees included; a parent may hold nothing of its own. */
	holdings: ValuedHolding[];
	total: Amount;
	/** What the holdings under it with both a cost and a price cost in rupees, and gained since. */
	cost: Amount | null;
	gain: Amount | null;
	unpriced: number;
};

/** Each account holding something and every parent of one, a parent first, totalling all held under it. */
export const byAccount = (holdings: ValuedHolding[]): Account[] =>
	[...new Set(holdings.flatMap((h) => parentsOf(h.account)))].toSorted(byPath).map((account) => {
		const under = holdings.filter(
			(h) => h.account === account || h.account.startsWith(`${account}:`),
		);
		const gained = under.filter((h) => h.gain !== null);

		return {
			account,
			holdings: under.filter((h) => h.account === account),
			total: sum(under.map((h) => h.value ?? (0n as Amount))),
			cost: gained.length === 0 ? null : sum(gained.map((h) => h.paid ?? (0n as Amount))),
			gain: gained.length === 0 ? null : sum(gained.map((h) => h.gain ?? (0n as Amount))),
			unpriced: under.filter((h) => h.value === null).length,
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
