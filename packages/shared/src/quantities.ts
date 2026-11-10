import * as v from 'valibot';
import { QuantityOut } from './amounts.ts';
import { DayOut } from './dates.ts';

/** What a bare amount is in. */
export const DEFAULT_COMMODITY = 'INR';

const SIGN = { unit: '@', total: '@@' };

/**
 * What a posting moves, going out: an amount with its price and lot cost, if
 * any.
 */
export const PostedOut = v.object({
	...QuantityOut.entries,
	price: v.nullable(v.object({ ...QuantityOut.entries, kind: v.picklist(['unit', 'total']) })),
	cost: v.nullable(v.object({ ...QuantityOut.entries, date: v.nullable(DayOut) })),
});

export type PostedOut = v.InferOutput<typeof PostedOut>;

/** An amount and its commodity, which a bare rupee amount leaves out. */
export const printQuantity = ({ amount, commodity }: v.InferOutput<typeof QuantityOut>): string =>
	commodity === DEFAULT_COMMODITY ? amount : `${amount} ${commodity}`;

/** A posting's amount with its lot cost and price, as the page shows it. */
export const printPosted = ({ price, cost, ...quantity }: PostedOut): string =>
	[
		printQuantity(quantity),
		...(cost ? [`{${[printQuantity(cost), ...(cost.date ? [cost.date] : [])].join(', ')}}`] : []),
		...(price ? [SIGN[price.kind], printQuantity(price)] : []),
	].join(' ');
