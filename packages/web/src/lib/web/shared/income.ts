import * as v from 'valibot';
import { EXPENSES, INCOME, type Amount, ZERO, printAmount, sum } from '@rupea/shared/money.ts';
import { PERIOD_PARAMS, periodIn } from './filter';
import { MONTHS, spanOf, statementOf } from './home';
import type { Spent } from './spending';

export const SPENT = 'Spent';
export const SAVED = 'Saved';

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
	const earned = Object.fromEntries(
		(income?.deltas ?? [])
			.filter((d) => d.account === INCOME)
			.map((d) => [`${d.bucket}`, -d.amount]),
	);
	const spent = Object.fromEntries(
		(spending?.deltas ?? [])
			.filter((d) => d.account === EXPENSES)
			.map((d) => [`${d.bucket}`, d.amount]),
	);

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
	const spent = (spending?.totals.find((t) => t.account === EXPENSES)?.amount ?? ZERO) as Amount;

	return {
		bucket: '',
		total: printAmount(earned),
		[SPENT]: printAmount(spent),
		[SAVED]: printAmount((earned - spent) as Amount),
	};
};

/**
 * The accounts under Income as the table lists them, what each earned in a
 * month and over the range, the largest in the month first.
 */
export const sourcesOf = (month: Spent | undefined, range: Spent | undefined) => {
	const statement = statementOf('Income', month, range);

	return {
		rows: statement.rows.map((r) => ({ name: r.name, month: r.amount, range: r.before })),
		total: { month: statement.total.amount, range: statement.total.before },
	};
};
