import { divide, type Amount, type Quantity } from './amounts';
import {
	PriceKind,
	PriceSource,
	type Price,
	type RupeeLedgerFile,
	type RupeeTransaction,
} from './types';

export const marketPrices = (file: RupeeLedgerFile) => [
	...file.prices.map((p) => ({ ...p, source: PriceSource.Line })),
	...file.transactions.flatMap(postingPrices),
];

export const unitPrice = (p: { amount: Amount; price: Price | null }): Quantity | null => {
	if (p.price === null || p.amount === 0n) return null;
	if (p.price.kind === PriceKind.Unit)
		return { amount: p.price.amount, commodity: p.price.commodity };

	const units = (p.amount < 0n ? -p.amount : p.amount) as Amount;
	return { amount: divide(p.price.amount, units), commodity: p.price.commodity };
};

const postingPrices = (t: RupeeTransaction) =>
	t.postings.flatMap((p) => {
		const price = unitPrice(p);
		if (price === null) return [];

		const source = PriceSource.Posting;
		return [{ location: t.location, date: t.date, commodity: p.commodity, price, source }];
	});
