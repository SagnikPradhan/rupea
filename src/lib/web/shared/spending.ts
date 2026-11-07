import { isUnder } from './accounts';
import { OTHER, PARTS } from './chart';

export const PREVIOUS = 'Previous';

/** An average month, so a year's spending divides into twelve of them. */
const MONTH_DAYS = 365.25 / 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Spending over one range, as the expenses page receives it. */
export type Spent = {
	buckets: string[];
	/** Each account's total, and the account the server draws it under. */
	totals: { account: string; parent: string | null; amount: string }[];
	deltas: { account: string; bucket: string; amount: string }[];
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

/** The top account, then each account under it followed by its own, the largest first at every level. */
export const largestFirst = <
	Total extends { account: string; parent: string | null; amount: string },
>(
	t: Total[],
	a: string,
) => {
	const children = Object.groupBy(t, (r) => r.parent ?? '');
	const under = (p: string): Total[] =>
		(children[p] ?? [])
			.toSorted((x, y) => Number(y.amount) - Number(x.amount))
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

/** The largest accounts the server draws under one each get a share of every bar, the largest first. */
export const partsOf = (spending: Spent | undefined, account: string) =>
	(spending?.totals ?? [])
		.filter((t) => t.parent === account)
		.toSorted((a, b) => Number(b.amount) - Number(a.amount))
		.slice(0, PARTS - 1)
		.map((t) => t.account);

/** Both ranges start as far into their period, so their buckets match from the first one on. */
export const barsOf = ({ spending, previous, account, parts }: ChartOptions) => {
	const spent = Object.fromEntries(
		(spending?.deltas ?? []).map((s) => [`${s.account} ${s.bucket}`, Number(s.amount)]),
	);
	const earlier = Object.fromEntries(
		(previous?.deltas ?? []).filter((s) => s.account === account).map((s) => [s.bucket, s.amount]),
	);

	return (spending?.buckets ?? []).map((b, i) => {
		const before = previous?.buckets[i];
		return {
			...piled({ account, parts }, b, (a) => spent[`${a} ${b}`] ?? 0),
			[PREVIOUS]: before === undefined ? null : (earlier[before] ?? '0'),
		};
	});
};

/** The whole range as one bar, against the whole range before it. */
export const wholeOf = ({ spending, previous, account, parts }: ChartOptions) => {
	const spent = Object.fromEntries(
		(spending?.totals ?? []).map((t) => [t.account, Number(t.amount)]),
	);
	return {
		...piled({ account, parts }, '', (a) => spent[a] ?? 0),
		[PREVIOUS]: totalOf(previous, account),
	};
};

/** What the range spent in all, or null when there is no such range. */
export const totalOf = (s: Spent | undefined, a: string) =>
	s ? (s.totals.find((t) => t.account === a)?.amount ?? '0') : null;

/** How many days a span covers, counting both of its ends. */
export const daysIn = (f: string, t: string) =>
	Math.round((Date.parse(t) - Date.parse(f)) / DAY_MS) + 1;

/** How many average months a span covers, counting both of its days. */
export const monthsIn = (f: string, t: string) => daysIn(f, t) / MONTH_DAYS;

/** What a bar holds, by part; whatever the parts leave, to the paisa, is the other spending. */
const piled = (
	{ account, parts }: { account: string; parts: string[] },
	bucket: string,
	spentIn: (account: string) => number,
) => {
	const amounts = parts.map((p) => spentIn(p));
	const rest = Math.round((spentIn(account) - amounts.reduce((t, a) => t + a, 0)) * 100) / 100;
	return {
		bucket,
		total: String(spentIn(account)),
		...Object.fromEntries(parts.map((p, i) => [p, String(amounts[i] ?? 0)])),
		[OTHER]: String(rest),
	};
};
