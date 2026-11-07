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
	/** The account it is drawn under, as parentsIn divides them. */
	parent: string | null;
	first: Temporal.PlainDate;
	amount: Amount;
	unpriced: number;
};

/** Spending over a span: the first and last day it covers, what its bars add up, every bucket between, each account's total, and each account's buckets. */
export type Spending = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: Bucket;
	buckets: Temporal.PlainDate[];
	totals: Total[];
	spent: Spent[];
};

type SpendingOfOptions = { span: Span; bucket: Bucket; parents: Record<string, string | null> };

/** All of history starts long before a ledger does, so it starts on the first day anything was spent. */
export const spendingOf = (
	spent: Spent[],
	{ span, bucket, parents }: SpendingOfOptions,
): Spending => {
	const totals = totalsOf(spent, parents);
	const from = span.from.toString() === BEGINNING ? (totals[0]?.first ?? span.to) : span.from;

	return {
		from,
		to: span.to,
		bucket,
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

/** Each account's spending and its parents' over every bucket, by path, leaving out those not drawn. */
const totalsOf = (spent: Spent[], parents: Record<string, string | null>): Total[] => {
	const groups = Object.groupBy(sharesOf(spent), (s) => s.account);
	return Object.entries(groups)
		.flatMap(([account, g]) =>
			g?.[0] && Object.hasOwn(parents, account)
				? [{ account, parent: parents[account] ?? null, ...added(g[0], g) }]
				: [],
		)
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

/** What was spent on one day of the month, averaged over the months of a span that have it. */
export type Daily = { day: number; amount: Amount; unpriced: number };

/** Every day of the month from the 1st to the 31st, dated in the reference January the adapter buckets them in. */
export const dailyOf = (spent: Spent[], span: Span): Daily[] => {
	const earliest = spent.map((s) => s.first).toSorted(Temporal.PlainDate.compare)[0] ?? span.to;
	const from = span.from.toString() === BEGINNING ? earliest : span.from;
	const days = Object.groupBy(spent, (s) => s.bucket.day);

	return Array.from({ length: 31 }, (_, i) => {
		const rows = days[i + 1] ?? [];
		const months = Math.max(monthsWith(i + 1, { from, to: span.to }), 1);

		return {
			day: i + 1,
			amount: (sum(rows.map((r) => r.amount)) / BigInt(months)) as Amount,
			unpriced: rows.reduce((n, r) => n + r.unpriced, 0),
		};
	});
};

/** How many months of a span have this day of the month inside it. */
const monthsWith = (day: number, span: Span) =>
	bucketsIn(span, 'month').filter((m) => {
		if (m.daysInMonth < day) return false;
		const on = m.with({ day });
		return (
			Temporal.PlainDate.compare(on, span.from) >= 0 && Temporal.PlainDate.compare(on, span.to) <= 0
		);
	}).length;
