import { DEFAULT_COMMODITY, multiply, type Amount, type Quantity } from './amounts';
import { hasLots } from '@rupea/shared/money.ts';

export const HOPS = 2;

/**
 * Units held now in one account, and what its open lots cost in all, when that
 * is one commodity.
 */
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

/**
 * The commodities holdings need a price for: their own, and what their lots
 * cost in.
 */
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
