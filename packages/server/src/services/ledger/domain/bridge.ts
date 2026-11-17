import { ASSETS, EXPENSES, INCOME, LIABILITIES } from '@rupea/shared/money.ts';
import { sum, type Amount } from './amounts';
import type { Row } from './deltas';

/** What the prices of one group of balances added over the span. */
export type Shift = { account: string; amount: Amount };

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

const WORTH = [ASSETS, LIABILITIES];

type BridgeOfOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	start: Row[];
	end: Row[];
	gains: Row[];
};

/**
 * Splits the change in net worth into income, expenses and the price moves of
 * each group, the accounts directly under Assets and Liabilities. The rows are
 * the balances on the first day, the balances at the end of each bucket up to
 * the last day, and what accounts gained after the first day. A group's price
 * move is what its balance changed by beyond what it gained, and whatever the
 * groups, income and expenses leave, such as a gift or income reinvested into a
 * priced unit, is kept as other, which can be large or negative, so the parts
 * always add up to the change. A group whose prices did nothing is left out.
 */
export const bridgeOf = ({ from, to, start, end, gains }: BridgeOfOptions): Bridge => {
	const last = end.filter((r) => r.bucket === String(to.year));
	const shifts = groupsIn(last)
		.map((account) => ({
			account,
			amount: (totalOf(last, account) -
				totalOf(start, account) -
				totalOf(gains, account)) as Amount,
		}))
		.filter((s) => s.amount !== 0n);

	const income = -totalOf(gains, INCOME) as Amount;
	const expenses = totalOf(gains, EXPENSES);
	const before = worthOf(start);
	const after = worthOf(last);
	const moved = sum(shifts.map((s) => s.amount));

	return {
		from,
		to,
		start: before,
		income,
		expenses,
		shifts,
		other: (after - before - income + expenses - moved) as Amount,
		end: after,
	};
};

/** The accounts directly under Assets and Liabilities. */
const groupsIn = (r: Row[]) =>
	r
		.map((x) => x.account)
		.filter((a) => WORTH.includes(a.split(':')[0] ?? '') && a.split(':').length === 2);

const worthOf = (r: Row[]) => sum(WORTH.map((a) => totalOf(r, a)));

const totalOf = (r: Row[], a: string) =>
	sum(r.filter((x) => x.account === a).map((x) => x.value ?? (0n as Amount)));
