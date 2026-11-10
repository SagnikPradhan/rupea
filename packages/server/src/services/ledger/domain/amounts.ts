import { printAmount, type Amount } from '@rupea/shared/amounts.ts';

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
} from '@rupea/shared/amounts.ts';

/** What a bare amount is in. */
export const DEFAULT_COMMODITY = 'INR';

export type Quantity = { amount: Amount; commodity: string };

export const formatQuantity = ({ amount, commodity }: Quantity): string =>
	commodity === DEFAULT_COMMODITY ? printAmount(amount) : `${printAmount(amount)} ${commodity}`;
