import { type Amount, ZERO } from '@rupea/shared/money.ts';
import { IsoDay } from '@rupea/shared/dates.ts';
import * as v from 'valibot';
import { isUnder, nameOf } from './accounts';

/** One budget on a day, with what its account and those under it spent. */
export type BudgetView = {
	account: string;
	length: 'month' | 'year';
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	limit: Amount;
	spent: Amount;
	left: Amount;
	current: Record<string, string>;
};

const SCALE = 1000n;

/** The budgets under an account as the page lists them, the most spent first. */
export const rowsFor = (budgets: BudgetView[], account: string): BudgetRow[] =>
	budgets
		.filter((b) => isUnder(b.account, account))
		.map((b) => ({
			budget: b,
			percent: percentOf(b),
			over: b.spent > b.limit,
			bar: barOf(b),
		}))
		.toSorted(
			(a, b) =>
				(b.percent ?? Infinity) - (a.percent ?? Infinity) ||
				a.budget.account.localeCompare(b.budget.account),
		);

/** One row of the budgets list. */
export type BudgetRow = {
	budget: BudgetView;
	percent: number | null;
	over: boolean;
	bar: { share: number; limit: number };
};

/**
 * A budget row, where today stands on its bar, and whether it is spending ahead
 * of its period.
 */
export type WatchedRow = { row: BudgetRow; pace: number; close: boolean };

/**
 * The rows with those over first, then those spending faster than their period
 * or past nine tenths, then the rest, each group as the rows came.
 */
export const watchOf = (rows: BudgetRow[], today: Temporal.PlainDate): WatchedRow[] =>
	rows
		.map((row) => {
			const spent = row.percent === null ? 0 : row.percent / 100;
			const elapsed = elapsedOf(row.budget, today);
			const ahead = spent >= 0.9 || spent > elapsed + 0.1;

			return {
				row,
				pace: elapsed * row.bar.limit,
				close: !row.over && row.percent !== null && ahead,
			};
		})
		.toSorted((a, b) => rankOf(a) - rankOf(b));

/** What the budgets spent of what they allow, counting each posting once. */
export const totalOf = (rows: BudgetRow[]) => {
	const top = rows.filter(
		(r) => !rows.some((o) => o !== r && isUnder(r.budget.account, o.budget.account)),
	);

	const spent = top.reduce((t, r) => t + r.budget.spent, 0n) as Amount;
	const limit = top.reduce((t, r) => t + r.budget.limit, 0n) as Amount;

	return { spent, limit, gap: (spent > limit ? spent - limit : limit - spent) as Amount };
};

/** The line under the title, like 6 budgets · 2 over. */
export const subtitleOf = (rows: BudgetRow[]) => {
	if (rows.length === 0) return 'No budgets';

	const count = `${rows.length} ${rows.length === 1 ? 'budget' : 'budgets'}`;
	const over = rows.filter((r) => r.over).length;

	return `${count} · ${over === 0 ? 'none' : over} over`;
};

/** The figure and detail of the tile naming the accounts that are over. */
export const overOf = (rows: BudgetRow[]) => {
	if (rows.length === 0) return { figure: '–', detail: 'None set' };

	const names = rows.filter((r) => r.over).map((r) => nameOf(r.budget.account));

	return {
		figure: `${names.length} of ${rows.length}`,
		detail: names.length === 0 ? 'None over' : namedIn(names),
	};
};

/**
 * The start key for the form's Starts on, a day of the month or a month of the
 * year: the latest such date up to today. Null when it is the default.
 */
export const startOf = ({
	length,
	on,
	today,
}: {
	length: 'month' | 'year';
	on: number;
	today: Temporal.PlainDate;
}) => {
	if (on === 1) return null;

	const start = length === 'month' ? latestDayOn(today, on) : latestMonthOn(today, on);

	return start!.toString();
};

/** The form's Starts on from the entries of a budget; 1 when it has no start. */
export const startsOnOf = (current: Record<string, string>) => {
	const { start, period } = current;
	const day = dateOf(start);

	return { on: (period === 'year' ? day?.month : day?.day) ?? 1 };
};

const rankOf = ({ row, close }: WatchedRow) => {
	if (row.over) return 0;
	if (close) return 1;

	return 2;
};

/** The share of a budget's period gone by the end of today, from 0 to 1. */
const elapsedOf = (b: BudgetView, today: Temporal.PlainDate) => {
	const days = b.from.until(b.to).days + 1;
	const gone = b.from.until(today).days + 1;

	return Math.min(Math.max(gone / days, 0), 1);
};

const percentOf = (b: BudgetView) =>
	b.limit === ZERO ? null : Number((b.spent * 200n + b.limit) / (b.limit * 2n));

const barOf = (b: BudgetView) => {
	if (b.limit === ZERO) return { share: b.spent > ZERO ? 2 : 0, limit: 0 };

	return { share: Number((b.spent * SCALE) / b.limit) / Number(SCALE), limit: 1 };
};

const namedIn = (names: string[]) => {
	if (names.length <= 2) return names.join(' and ');

	return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
};

const dateOf = (s: string | undefined) => (v.is(IsoDay, s) ? Temporal.PlainDate.from(s) : null);

const latestDayOn = (today: Temporal.PlainDate, on: number) =>
	Array.from({ length: 14 }, (_, i) => today.with({ day: 1 }).subtract({ months: i }))
		.filter((m) => m.daysInMonth >= on)
		.map((m) => m.with({ day: on }))
		.find((d) => Temporal.PlainDate.compare(d, today) <= 0);

const latestMonthOn = (today: Temporal.PlainDate, on: number) => {
	const found = Temporal.PlainDate.from({ year: today.year, month: on, day: 1 });

	return Temporal.PlainDate.compare(found, today) > 0 ? found.subtract({ years: 1 }) : found;
};
