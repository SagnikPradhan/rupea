import * as v from 'valibot';
import { Amount, EXPENSES, INCOME, ZERO, max, min, printAmount, sum } from '@rupea/shared/money.ts';
import { statementOf } from './home';
import { totalOf, type Spent } from './spending';

export const SPENT = 'Spent';
export const INVESTED = 'Invested';
export const KEPT = 'Kept';
export const FROM_SAVINGS = 'From savings';

const LAST_DAY = '9999-12-31';

const INVESTMENTS = ['Income:Interest', 'Income:Dividends'];

/**
 * What an account and those under it earned, without the minus income is
 * credited with.
 */
export const incomeOf = (s: Spent | undefined, a: string) =>
	-(s?.totals.find((t) => t.account === a)?.amount ?? ZERO) as Amount;

/** What the accounts under Income:Interest and Income:Dividends earned. */
export const investmentIncomeOf = (s: Spent | undefined) =>
	sum(INVESTMENTS.map((a) => incomeOf(s, a)));

export type Paid = { day: string; cost: string };

type SplitOptions = { income: Spent | undefined; spending: Spent | undefined; paid: Paid[] };

/**
 * Each bucket's income, split into what was spent, what went into holdings with
 * lots and what was kept, as chart text. Spending and investing past the income
 * are drawn from savings, below zero. What went in is the change in what was
 * paid for the lots over the bucket; a bucket with no point keeps what the one
 * before it paid.
 */
export const monthsOf = ({ income, spending, paid }: SplitOptions) => {
	const earned = amountsOn(income, INCOME, -1n);
	const spent = amountsOn(spending, EXPENSES, 1n);
	const paidBy = paidByOf(paid);
	const buckets = income?.buckets ?? [];

	return buckets.map((b, i) => {
		const next = buckets[i + 1];
		const end = next ? next.subtract({ days: 1 }).toString() : LAST_DAY;
		const into = (paidBy(end) - paidBy(b.subtract({ days: 1 }).toString())) as Amount;

		return {
			bucket: b.toString(),
			...splitOf((earned[`${b}`] ?? ZERO) as Amount, (spent[`${b}`] ?? ZERO) as Amount, into),
		};
	});
};

/** The whole range as one bar, split the same way as a bucket. */
export const wholeOf = ({ income, spending, paid }: SplitOptions) => {
	const paidBy = paidByOf(paid);
	const first = income?.buckets[0];
	const into = first ? paidBy(LAST_DAY) - paidBy(first.subtract({ days: 1 }).toString()) : ZERO;

	return {
		bucket: '',
		...splitOf(incomeOf(income, INCOME), totalOf(spending, EXPENSES) ?? ZERO, into as Amount),
	};
};

/**
 * Income split into what was spent, then what was invested from what is left,
 * then what was kept, with what both took past the income as a negative.
 */
const splitOf = (earned: Amount, spent: Amount, invested: Amount) => {
	const total = max(earned, ZERO);
	const out = max(spent, ZERO);
	const into = max(invested, ZERO);

	const spentIn = min(out, total);
	const investedIn = min(into, (total - spentIn) as Amount);

	return {
		total: printAmount(earned),
		[SPENT]: printAmount(spentIn),
		[INVESTED]: printAmount(investedIn),
		[KEPT]: printAmount((total - spentIn - investedIn) as Amount),
		[FROM_SAVINGS]: printAmount(min((total - out - into) as Amount, ZERO)),
	};
};

/**
 * What the lots were paid for at the end of a day, from the last point by then.
 * The points start the day before the range, so a day before them reads the
 * first.
 */
const paidByOf = (paid: Paid[]) => {
	const closes = paid
		.toSorted((a, b) => a.day.localeCompare(b.day))
		.map((p) => [p.day, v.parse(Amount, p.cost)] as const);

	return (d: string) => (closes.findLast(([k]) => k <= d) ?? closes[0])?.[1] ?? ZERO;
};

/**
 * What an account came to in each month, by the day the month starts, with its
 * sign made right.
 */
const amountsOn = (s: Spent | undefined, a: string, by: bigint) =>
	Object.fromEntries(
		(s?.deltas ?? []).filter((d) => d.account === a).map((d) => [`${d.bucket}`, by * d.amount]),
	);

/**
 * The accounts under Income as the table lists them, what each earned in a
 * month and over the range, the largest in the month first.
 */
export const sourcesOf = (month: Spent | undefined, range: Spent | undefined) => {
	const statement = statementOf('Income', month, range);

	return {
		rows: statement.rows.map((r) => ({
			account: r.account,
			name: r.name,
			month: r.amount,
			range: r.before,
		})),
		total: { month: statement.total.amount, range: statement.total.before },
	};
};
