import type { Amount } from './amounts';
import type { Shift } from './worth';

/**
 * Why net worth went from start to end: what came in as income, what went out
 * as expenses, what prices did to each group, and whatever else is left.
 */
export type Bridge = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	start: Amount;
	income: Amount;
	expenses: Amount;
	shifts: Shift[];
	other: Amount;
	end: Amount;
};

type BridgeOfOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	start: Amount;
	end: Amount;
	income: Amount;
	expenses: Amount;
	shifts: Shift[];
};

/**
 * Splits the change in net worth into income, expenses and the price moves of
 * each group. Whatever those leave, such as income reinvested into a priced
 * unit or the effect of a foreign currency's price, is kept as other, which can
 * be large or negative, so the parts always add up to the change. A group whose
 * prices did nothing is left out.
 */
export const bridgeOf = ({ shifts: all, ...o }: BridgeOfOptions): Bridge => {
	const shifts = all.filter((s) => s.amount !== 0n);
	const moved = shifts.reduce((t, s) => t + s.amount, 0n);

	return {
		...o,
		shifts,
		other: (o.end - o.start - o.income + o.expenses - moved) as Amount,
	};
};
