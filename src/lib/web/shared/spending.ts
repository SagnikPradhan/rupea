import { isChildOf, isUnder } from './accounts';
import { PARTS } from './chart';

export const OTHER = 'Other';
export const PREVIOUS = 'Previous';

/** An average month, so a year's spending divides into twelve of them. */
const MONTH_DAYS = 365.25 / 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Spending over one range, as the expenses page receives it. */
export type Spent = {
	buckets: string[];
	totals: { account: string; amount: string }[];
	spent: { account: string; bucket: string; amount: string }[];
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

/** The largest accounts right under one each get a share of every bar, the largest first. */
export const partsOf = (spending: Spent | undefined, account: string) =>
	(spending?.totals ?? [])
		.filter((t) => isChildOf(t.account, account))
		.toSorted((a, b) => Number(b.amount) - Number(a.amount))
		.slice(0, PARTS - 1)
		.map((t) => t.account);

/** Both ranges start as far into their period, so their buckets match from the first one on. */
export const barsOf = ({ spending, previous, account, parts }: ChartOptions) => {
	const spent = Object.fromEntries(
		(spending?.spent ?? []).map((s) => [`${s.account} ${s.bucket}`, Number(s.amount)]),
	);
	const earlier = Object.fromEntries(
		(previous?.spent ?? []).filter((s) => s.account === account).map((s) => [s.bucket, s.amount]),
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

/** How many average months a span covers, counting both of its days. */
export const monthsIn = (f: string, t: string) =>
	((Date.parse(t) - Date.parse(f)) / DAY_MS + 1) / MONTH_DAYS;

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
