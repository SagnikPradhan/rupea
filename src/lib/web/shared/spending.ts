import { type Amount, ZERO, byAmount, printAmount, sum } from '#lib/shared/amounts.ts';
import { isUnder } from './accounts';
import { OTHER, PARTS } from './chart';

export const PREVIOUS = 'Previous';

/** An average month, 365.25 / 12 days, as a fraction so amounts divide exactly. */
const MONTH_DAYS = { days: 1461n, months: 48n };

/** Spending over one range, as the expenses page receives it. */
export type Spent = {
	buckets: Temporal.PlainDate[];
	/** Each account's total, and the account the server draws it under. */
	totals: { account: string; parent: string | null; amount: Amount }[];
	deltas: { account: string; bucket: Temporal.PlainDate; amount: Amount }[];
};

type ChartOptions = {
	spending: Spent | undefined;
	previous: Spent | undefined;
	account: string;
	parts: string[];
};

/** An account and those under it, as the table lists them. */
export const rowsOf = <Total extends { account: string }>(t: Total[], a: string) =>
	t.filter((r) => isUnder(r.account, a));

/**
 * The top account, then each account under it followed by its own, the largest
 * first at every level.
 */
export const largestFirst = <
	Total extends { account: string; parent: string | null; amount: Amount },
>(
	t: Total[],
	a: string,
) => {
	const children = Object.groupBy(t, (r) => r.parent ?? '');
	const under = (p: string): Total[] =>
		(children[p] ?? [])
			.toSorted((x, y) => byAmount(y.amount, x.amount))
			.flatMap((r) => [r, ...under(r.account)]);

	return [...t.filter((r) => r.account === a), ...under(a)];
};

/** The rows whose every account above, short of the top one, is opened. */
export const shownOf = <Total extends { account: string; parent: string | null }>(
	t: Total[],
	a: string,
	opened: string[],
) => {
	const parents = Object.fromEntries(t.map((r) => [r.account, r.parent]));
	const open = (p: string | null): boolean =>
		p === null || p === a || (opened.includes(p) && open(parents[p] ?? null));
	return t.filter((r) => r.account === a || open(r.parent));
};

/**
 * The largest accounts the server draws under one each get a share of every
 * bar, the largest first.
 */
export const partsOf = (spending: Spent | undefined, account: string) =>
	(spending?.totals ?? [])
		.filter((t) => t.parent === account)
		.toSorted((a, b) => byAmount(b.amount, a.amount))
		.slice(0, PARTS - 1)
		.map((t) => t.account);

/**
 * Both ranges start as far into their period, so their buckets match from the
 * first one on.
 */
export const barsOf = ({ spending, previous, account, parts }: ChartOptions) => {
	const spent = Object.fromEntries(
		(spending?.deltas ?? []).map((s) => [`${s.account} ${s.bucket}`, s.amount]),
	);
	const earlier = Object.fromEntries(
		(previous?.deltas ?? [])
			.filter((s) => s.account === account)
			.map((s) => [s.bucket.toString(), s.amount]),
	);

	return (spending?.buckets ?? []).map((b, i) => {
		const before = previous?.buckets[i];
		return {
			...piled({ account, parts }, b.toString(), (a) => spent[`${a} ${b}`] ?? ZERO),
			[PREVIOUS]: before === undefined ? null : printAmount(earlier[before.toString()] ?? ZERO),
		};
	});
};

/** The whole range as one bar, against the whole range before it. */
export const wholeOf = ({ spending, previous, account, parts }: ChartOptions) => {
	const spent = Object.fromEntries((spending?.totals ?? []).map((t) => [t.account, t.amount]));
	const before = totalOf(previous, account);

	return {
		...piled({ account, parts }, '', (a) => spent[a] ?? ZERO),
		[PREVIOUS]: before === null ? null : printAmount(before),
	};
};

/** What the range spent in all, or null when there is no such range. */
export const totalOf = (s: Spent | undefined, a: string) =>
	s ? (s.totals.find((t) => t.account === a)?.amount ?? ZERO) : null;

/** How many days a span covers, counting both of its ends. */
export const daysIn = (f: Temporal.PlainDate, t: Temporal.PlainDate) => f.until(t).days + 1;

/** What an amount comes to on each day of a span of days. */
export const dailyAverageOver = (a: Amount, d: number) => (a / BigInt(d)) as Amount;

/** What an amount comes to in an average month of a span of days. */
export const monthlyAverageOver = (a: Amount, d: number) =>
	((a * MONTH_DAYS.days) / (BigInt(d) * MONTH_DAYS.months)) as Amount;

/**
 * What a bar holds, by part, as chart text; whatever the parts leave is the
 * other spending.
 */
const piled = (
	{ account, parts }: { account: string; parts: string[] },
	bucket: string,
	spentIn: (account: string) => Amount,
) => {
	const amounts = parts.map((p) => spentIn(p));
	const rest = (spentIn(account) - sum(amounts)) as Amount;

	return {
		bucket,
		total: printAmount(spentIn(account)),
		...Object.fromEntries(parts.map((p, i) => [p, printAmount(amounts[i] ?? ZERO)])),
		[OTHER]: printAmount(rest),
	};
};
