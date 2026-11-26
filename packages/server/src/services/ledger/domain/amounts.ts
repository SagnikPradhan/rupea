import {
	printAmount,
	type Amount,
	DEFAULT_COMMODITY,
	type PostedOut,
} from '@rupea/shared/money.ts';
import type * as v from 'valibot';
import { PriceKind, type RupeaPosting } from './types';

export {
	AMOUNT_SCALE,
	AMOUNT_UNIT,
	divide,
	min,
	multiply,
	parseAmount,
	printAmount,
	sum,
	type Amount,
} from '@rupea/shared/money.ts';

export { DEFAULT_COMMODITY };

export type Quantity = { amount: Amount; commodity: string };

/** What a posting moves, in the shape the API sends. */
export const postedOf = ({
	amount,
	commodity,
	price,
	cost,
}: RupeaPosting): v.InferInput<typeof PostedOut> => ({
	amount,
	commodity,
	price: price && { ...price, kind: price.kind === PriceKind.Total ? 'total' : 'unit' },
	cost,
});

/**
 * With its commodity always written, for a message that has no base to leave
 * out.
 */
export const printQuantity = ({ amount, commodity }: Quantity): string =>
	`${printAmount(amount)} ${commodity}`;

/** As written in a file, the base left out. */
export const formatQuantity = ({ amount, commodity }: Quantity, b: string): string =>
	commodity === b ? printAmount(amount) : `${printAmount(amount)} ${commodity}`;
