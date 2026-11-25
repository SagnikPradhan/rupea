import * as v from 'valibot';
import { Amount, EXPENSES, INCOME, ZERO, printAmount, sum } from '@rupea/shared/money.ts';
import { PERIOD_PARAMS, periodIn } from './filter';
import { MONTHS, spanOf, statementOf } from './home';
import { totalOf, type Spent } from './spending';

export const SPENT = 'Spent';
export const SAVED = 'Saved';
export const INVESTED = 'Invested';
export const NOT_INVESTED = 'Not invested';

const LAST_DAY = '9999-12-31';

const INVESTMENTS = ['Income:Interest', 'Income:Dividends'];

/** The income page's URL query, whose period runs up to the day. */
export const IncomeQuery = (day: string) =>
	v.pipe(
		v.object({
			span: v.fallback(v.picklist(Object.keys(MONTHS)), ''),
			at: v.optional(v.string()),
			range: v.optional(v.string()),
			from: v.optional(v.string()),
			to: v.optional(v.string()),
		}),
		v.transform((fields) => ({
			span: fields.span,
			dated: PERIOD_PARAMS.some((k) => fields[k] !== undefined),
			period: fields.span ? spanOf(fields.span, day) : periodIn(fields, spanOf('12', day)),
		})),
	);

/**
 * What an account and those under it earned, without the minus income is
 * credited with.
 */
export const incomeOf = (s: Spent | undefined, a: string) =>
	-(s?.totals.find((t) => t.account === a)?.amount ?? ZERO) as Amount;

/** What the accounts under Income:Interest and Income:Dividends earned. */
export const investmentIncomeOf = (s: Spent | undefined) =>
	sum(INVESTMENTS.map((a) => incomeOf(s, a)));

/**
 * Each month's income, split into what was spent and what was kept, as chart
 * text.
 */
export const monthsOf = (income: Spent | undefined, spending: Spent | undefined) => {
	const earned = amountsOn(income, INCOME, -1n);
	const spent = amountsOn(spending, EXPENSES, 1n);

	return (income?.buckets ?? []).map((b) => {
		const earnedIn = (earned[`${b}`] ?? ZERO) as Amount;
		const spentIn = (spent[`${b}`] ?? ZERO) as Amount;

		return {
			bucket: b.toString(),
			total: printAmount(earnedIn),
			[SPENT]: printAmount(spentIn),
			[SAVED]: printAmount((earnedIn - spentIn) as Amount),
		};
	});
};

/** The whole range as one bar, in the same text as a month. */
export const wholeOf = (income: Spent | undefined, spending: Spent | undefined) => {
	const earned = incomeOf(income, INCOME);
	const spent = totalOf(spending, EXPENSES) ?? ZERO;

	return {
		bucket: '',
		total: printAmount(earned),
		[SPENT]: printAmount(spent),
		[SAVED]: printAmount((earned - spent) as Amount),
	};
};

export type Paid = { day: string; cost: string };

/**
 * Each bucket's income, split into what went into holdings with lots and what
 * did not, as chart text. What went in is the change in what was paid for the
 * lots over the bucket, held between nothing and the income. A bucket with no
 * point keeps what the one before it paid.
 */
export const investedOf = (income: Spent | undefined, paid: Paid[]) => {
	const earned = amountsOn(income, INCOME, -1n);
	const closes = paid
		.toSorted((a, b) => a.day.localeCompare(b.day))
		.map((p) => [p.day, v.parse(Amount, p.cost)] as const);
	const paidBy = (d: string) => closes.findLast(([k]) => k <= d)?.[1] ?? ZERO;
	const buckets = income?.buckets ?? [];

	return buckets.map((b, i) => {
		const earnedIn = (earned[`${b}`] ?? ZERO) as Amount;
		const next = buckets[i + 1];
		const end = next ? next.subtract({ days: 1 }).toString() : LAST_DAY;
		const into = clamp(paidBy(end) - paidBy(b.subtract({ days: 1 }).toString()), earnedIn);

		return {
			bucket: b.toString(),
			total: printAmount(earnedIn),
			[INVESTED]: printAmount(into),
			[NOT_INVESTED]: printAmount((earnedIn - into) as Amount),
		};
	});
};

/** The whole range as one bar, in the same text as a month. */
export const investedWholeOf = (income: Spent | undefined, paid: Paid[]) => {
	const months = investedOf(income, paid);
	const total = (f: (m: (typeof months)[number]) => string) =>
		printAmount(sum(months.map((m) => v.parse(Amount, f(m)))));

	return {
		bucket: '',
		total: total((m) => m.total),
		[INVESTED]: total((m) => m[INVESTED]),
		[NOT_INVESTED]: total((m) => m[NOT_INVESTED]),
	};
};

/** A change held between nothing and the most. */
const clamp = (c: bigint, m: Amount) => (c < ZERO ? ZERO : c > m ? m : c) as Amount;

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
