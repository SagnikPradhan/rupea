import { type Amount, ZERO, byAmount, printAmount, sum } from '#lib/shared/amounts.ts';
import { depthOf, isUnder, nameOf } from './accounts';
import type { Period } from '#lib/shared/dates.ts';
import { formatChange } from './format';
import type { Spent } from './spending';

/** The most expense groups the income statement names before the rest. */
const NAMED = 5;

/**
 * What the span chip offers, in the order a click steps through them; the key
 * is the months it reaches back.
 */
export const SPANS: Record<string, string> = {
	'12': 'Last year',
	'24': 'Last 2 years',
	'60': 'Last 5 years',
	all: 'All time',
};

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

/** The span choices, named short enough for a segment. */
export const SPANS_BRIEF: Record<string, string> = {
	'12': '1Y',
	'24': '2Y',
	'60': '5Y',
	all: 'All',
};

/** The month choices, named short enough for a segment. */
export const MONTHS_BRIEF: Record<string, string> = {
	'3': '3M',
	'6': '6M',
	'12': '12M',
	all: 'All',
};

/**
 * What the account chip offers, in the order a click steps through them; the
 * key is the account.
 */
export const SIDES: Record<string, string> = {
	'': 'All accounts',
	Assets: 'Assets',
	Liabilities: 'Liabilities',
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
 * The accounts directly under a top account, the largest first; what is owed
 * counts as a size, not a sign.
 */
export const groupsOf = (accounts: { account: string; total: Amount }[], top: string) =>
	accounts
		.filter((a) => depthOf(a.account) === 1 && isUnder(a.account, top))
		.map((a) => ({ name: nameOf(a.account), size: (a.total < 0n ? -a.total : a.total) as Amount }))
		.toSorted((a, b) => byAmount(b.size, a.size))
		.map((a) => ({ name: a.name, total: printAmount(a.size) }));

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
		.map((a) => ({ name: nameOf(a), amount: now[a] ?? ZERO, before: before[a] ?? ZERO }))
		.toSorted((a, b) => byAmount(b.amount, a.amount));

	const named = groups.slice(0, NAMED);
	const rest = groups.slice(NAMED);
	const restOf = (k: 'amount' | 'before') => sum(rest.map((g) => g[k]));

	const rows =
		rest.length > 0
			? [...named, { name: 'Everything else', amount: restOf('amount'), before: restOf('before') }]
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
