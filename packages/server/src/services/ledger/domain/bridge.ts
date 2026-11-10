import type { Amount } from './amounts';
import type { Move } from './worth';

/**
 * What the prices of one group's holdings added to net worth over a span, owing
 * as it is held.
 */
type Shift = { account: string; amount: Amount };

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
	moves: Move[];
};

/**
 * Each group's price moves added up over the span, leaving out a group whose
 * prices did nothing.
 */
const shiftsOf = (moves: Move[]): Shift[] =>
	moves
		.map((m) => ({
			account: m.part,
			amount: m.after.reduce((t, a, i) => t + a - (m.before[i] ?? 0n), 0n) as Amount,
		}))
		.filter((s) => s.amount !== 0n);

/**
 * Splits the change in net worth into income, expenses and the price moves of
 * each group. Whatever those leave, such as income reinvested into a priced
 * unit or the effect of a foreign currency's price, is kept as other, which can
 * be large or negative, so the parts always add up to the change.
 */
export const bridgeOf = ({ moves, ...o }: BridgeOfOptions): Bridge => {
	const shifts = shiftsOf(moves);
	const moved = shifts.reduce((t, s) => t + s.amount, 0n);

	return {
		...o,
		shifts,
		other: (o.end - o.start - o.income + o.expenses - moved) as Amount,
	};
};
