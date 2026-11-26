import { type Amount, ZERO, byAmount, printAmount, sum } from '@rupea/shared/money.ts';
import { depthOf, isUnder, nameOf } from './accounts';
import type { Period } from '@rupea/shared/dates.ts';
import { formatChange } from './format';
import type { Spent } from './spending';

/** The most expense groups the income statement names before the rest. */
const NAMED = 5;

/**
 * What the span chip of a page about a year of money offers, in the order a
 * click steps through them.
 */
export const MONTHS: Record<string, string> = {
	'3': 'Last 3 months',
	'6': 'Last 6 months',
	'12': 'Last 12 months',
	all: 'All time',
};

/** The month choices, named short enough for a segment. */
export const MONTHS_BRIEF: Record<string, string> = {
	'3': '3M',
	'6': '6M',
	'12': '12M',
	all: 'All',
};

/** The same day some months earlier, a day the month lacks moving to its last. */
export const monthsBefore = (day: string, months: number) => {
	const year = Number(day.slice(0, 4));
	const month = Number(day.slice(5, 7)) - 1 - months;
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

	return new Date(Date.UTC(year, month, Math.min(Number(day.slice(8, 10)), last)))
		.toISOString()
		.slice(0, 10);
};

/** The period a span chip picks, ending on a day. */
export const spanOf = (k: string, d: string): Period =>
	k === 'all' ? { kind: 'all' } : { kind: 'custom', from: monthsBefore(d, Number(k)), to: d };

/** The month before a day's, like 2026-10 for 2026-11-03. */
export const lastMonthOf = (day: string) => {
	const month = Number(day.slice(5, 7)) - 1;
	return new Date(Date.UTC(Number(day.slice(0, 4)), month - 1, 1)).toISOString().slice(0, 7);
};

/**
 * The groups directly under a top account, each the sum of the accounts under
 * it, the largest first; what is owed counts as a size, not a sign. A group may
 * be missing from the list when only its accounts are.
 */
export const groupsOf = (accounts: { account: string; total: Amount }[], top: string) => {
	const under = accounts.filter((a) => depthOf(a.account) >= 1 && isUnder(a.account, top));
	const leaves = under.filter((a) => !under.some((b) => b !== a && isUnder(b.account, a.account)));
	const totals: Record<string, Amount> = {};
	for (const leaf of leaves) {
		const group = leaf.account.split(':').slice(0, 2).join(':');
		totals[group] = sum([
			totals[group] ?? ZERO,
			leaf.total < 0n ? (-leaf.total as Amount) : leaf.total,
		]);
	}

	return Object.entries(totals)
		.toSorted(([, x], [, y]) => byAmount(y, x))
		.map(([group, size]) => ({ name: nameOf(group), total: printAmount(size) }));
};

/** An amount of what is owed as a size, without the sign of a liability. */
export const owedOf = (l: string) => String(Math.abs(Number(l)));

/**
 * What the groups under Expenses or Income came to, Income without the minus it
 * is credited with, over a month and the one before, the largest groups named
 * and the rest together.
 */
export const statementOf = (
	top: 'Expenses' | 'Income',
	spending: Spent | undefined,
	previous: Spent | undefined,
) => {
	const sign = top === 'Income' ? -1n : 1n;
	const sizeOf = (n: Amount) => (sign * n) as Amount;
	const now = Object.fromEntries(
		(spending?.totals ?? []).map((t) => [t.account, sizeOf(t.amount)]),
	);
	const before = Object.fromEntries(
		(previous?.totals ?? []).map((t) => [t.account, sizeOf(t.amount)]),
	);

	const accounts = [...(spending?.totals ?? []), ...(previous?.totals ?? [])]
		.filter((t) => t.parent === top)
		.map((t) => t.account);
	const groups = [...new Set(accounts)]
		.map((a) => ({
			account: a,
			name: nameOf(a),
			amount: now[a] ?? ZERO,
			before: before[a] ?? ZERO,
		}))
		.toSorted((a, b) => byAmount(b.amount, a.amount));

	const named = groups.slice(0, NAMED);
	const rest = groups.slice(NAMED);
	const restOf = (k: 'amount' | 'before') => sum(rest.map((g) => g[k]));

	const rows =
		rest.length > 0
			? [
					...named,
					{
						account: '',
						name: 'Everything else',
						amount: restOf('amount'),
						before: restOf('before'),
					},
				]
			: named;
	const total = {
		amount: now[top] ?? ZERO,
		before: before[top] ?? ZERO,
	};

	return {
		rows: rows.map(changed),
		total: changed(total),
	};
};

const changed = <Row extends { amount: Amount; before: Amount }>(r: Row) => ({
	...r,
	change: formatChange(printAmount(r.before), printAmount(r.amount)),
});

/** What income left after spending over a month and the one before. */
export const savedOf = (income: { amount: Amount; before: Amount }, spent: typeof income) =>
	changed({
		amount: (income.amount - spent.amount) as Amount,
		before: (income.before - spent.before) as Amount,
	});
