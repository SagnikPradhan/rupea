import { bucketsIn, type Bucket, type Span } from '#lib/shared/dates.ts';
import { sum, type Amount } from './amounts';
import { byPath, parentsOf } from './taxonomy';

/** What one Expenses account gained in rupees over one bucket, and how many of its amounts had no price. */
export type Spent = {
	account: string;
	bucket: Temporal.PlainDate;
	amount: Amount;
	unpriced: number;
};

/** What one Expenses account and the accounts under it gained over a whole span. */
export type Total = { account: string; amount: Amount; unpriced: number };

/** Spending over a span: every bucket from the first with any, each account's total, and each account's buckets. */
export type Spending = { buckets: Temporal.PlainDate[]; totals: Total[]; spent: Spent[] };

/** All of history starts long before a ledger does, so its bars start at the first spending. */
export const spendingOf = (spent: Spent[], span: Span, bucket: Bucket): Spending => {
	const first = spent.map((s) => s.bucket).toSorted(Temporal.PlainDate.compare)[0];
	const from = first && Temporal.PlainDate.compare(first, span.from) > 0 ? first : span.from;

	return {
		buckets: first ? bucketsIn({ from, to: span.to }, bucket) : [],
		totals: totalsOf(spent),
		spent: rolledUp(spent),
	};
};

/** Each account's spending and its parents', by path and then bucket; a parent adds up the accounts under it. */
const rolledUp = (spent: Spent[]): Spent[] =>
	accountsIn(spent).flatMap((account) => {
		const inOrder = under(spent, account).toSorted((a, b) =>
			Temporal.PlainDate.compare(a.bucket, b.bucket),
		);
		const buckets = Object.groupBy(inOrder, (s) => s.bucket.toString());
		return Object.values(buckets).flatMap((b) =>
			b?.[0] ? [{ account, bucket: b[0].bucket, ...added(b) }] : [],
		);
	});

/** Each account's spending and its parents' over every bucket, by path. */
const totalsOf = (r: Spent[]): Total[] =>
	accountsIn(r).map((a) => ({ account: a, ...added(under(r, a)) }));

const accountsIn = (r: Spent[]) =>
	[...new Set(r.flatMap((s) => parentsOf(s.account)))].toSorted(byPath);

const under = (r: Spent[], a: string) =>
	r.filter((s) => s.account === a || s.account.startsWith(`${a}:`));

const added = (spent: Spent[]) => ({
	amount: sum(spent.map((s) => s.amount)),
	unpriced: spent.reduce((n, s) => n + s.unpriced, 0),
});
