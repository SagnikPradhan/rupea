import { BEGINNING, bucketsIn, type Bucket, type Span } from '#lib/shared/dates.ts';
import { sum, type Amount } from './amounts';
import { byPath, parentsOf } from './taxonomy';

/** What one Expenses account gained in rupees over one bucket, from the first day it spent, and how many of its amounts had no price. */
export type Spent = {
	account: string;
	bucket: Temporal.PlainDate;
	first: Temporal.PlainDate;
	amount: Amount;
	unpriced: number;
};

/** What one Expenses account and the accounts under it gained over a whole span. */
export type Total = {
	account: string;
	first: Temporal.PlainDate;
	amount: Amount;
	unpriced: number;
};

/** Spending over a span: the first day it covers, every bucket from there, each account's total, and each account's buckets. */
export type Spending = {
	from: Temporal.PlainDate;
	buckets: Temporal.PlainDate[];
	totals: Total[];
	spent: Spent[];
};

/** All of history starts long before a ledger does, so it starts on the first day anything was spent. */
export const spendingOf = (spent: Spent[], span: Span, bucket: Bucket): Spending => {
	const totals = totalsOf(spent);
	const from = span.from.toString() === BEGINNING ? (totals[0]?.first ?? span.to) : span.from;

	return {
		from,
		buckets: bucketsIn({ from, to: span.to }, bucket),
		totals,
		spent: rolledUp(spent),
	};
};

/** Each account's spending and its parents', by path and then bucket. */
const rolledUp = (spent: Spent[]): Spent[] => {
	const groups = Object.groupBy(sharesOf(spent), (s) => `${s.account} ${s.bucket}`);
	return Object.values(groups)
		.flatMap((g) => (g?.[0] ? [{ ...g[0], ...added(g[0], g) }] : []))
		.toSorted(
			(a, b) => byPath(a.account, b.account) || Temporal.PlainDate.compare(a.bucket, b.bucket),
		);
};

/** Each account's spending and its parents' over every bucket, by path. */
const totalsOf = (spent: Spent[]): Total[] => {
	const groups = Object.groupBy(sharesOf(spent), (s) => s.account);
	return Object.entries(groups)
		.flatMap(([account, g]) => (g?.[0] ? [{ account, ...added(g[0], g) }] : []))
		.toSorted((a, b) => byPath(a.account, b.account));
};

/** Each amount once for its own account and once for each parent, which adds up the accounts under it. */
const sharesOf = (r: Spent[]) =>
	r.flatMap((s) => parentsOf(s.account).map((a) => ({ ...s, account: a })));

const added = (head: Spent, spent: Spent[]) => ({
	first: spent.reduce(
		(a, s) => (Temporal.PlainDate.compare(a, s.first) <= 0 ? a : s.first),
		head.first,
	),
	amount: sum(spent.map((s) => s.amount)),
	unpriced: spent.reduce((n, s) => n + s.unpriced, 0),
});
