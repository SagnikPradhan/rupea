import { bucketsIn, type Bucket, type Span } from '@rupea/shared/dates.ts';
import { sum, type Amount } from './amounts';
import { byPath, parentsOf } from './taxonomy';

/**
 * What one account gained in the base over one bucket, from the first day it
 * changed, how much came in and went out to make that, and how many of its
 * amounts had no price.
 */
export type Delta = {
	account: string;
	bucket: Temporal.PlainDate;
	first: Temporal.PlainDate;
	amount: Amount;
	/** The positive postings summed. */
	inflow: Amount;
	/** The negative postings summed, as a positive amount. */
	outflow: Amount;
	unpriced: number;
};

/** What one account and the accounts under it gained over a whole span. */
export type Total = {
	account: string;
	/** The account it is drawn under, as parentsIn divides them. */
	parent: string | null;
	first: Temporal.PlainDate;
	amount: Amount;
	inflow: Amount;
	outflow: Amount;
	unpriced: number;
};

/**
 * Deltas over a span: the first and last day it covers, what its bars add up,
 * every bucket between, each account's total, and each account's buckets.
 */
export type Deltas = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: Bucket;
	buckets: Temporal.PlainDate[];
	totals: Total[];
	deltas: Delta[];
};

const texts = new WeakMap<Temporal.PlainDate, string>();

/**
 * A date as text, which sorts as the date does, worked out once for each date
 * since a few dates fill thousands of rows.
 */
const textOf = (d: Temporal.PlainDate): string => {
	const text = texts.get(d) ?? d.toString();
	texts.set(d, text);
	return text;
};

type DeltasOfOptions = { span: Span; bucket: Bucket; parents: Record<string, string | null> };

export const deltasOf = (deltas: Delta[], { span, bucket, parents }: DeltasOfOptions): Deltas => ({
	from: span.from,
	to: span.to,
	bucket,
	buckets: bucketsIn(span, bucket),
	totals: totalsOf(deltas, parents),
	deltas: rolledUp(deltas),
});

/** Each account's gain and its parents', by path and then bucket. */
const rolledUp = (deltas: Delta[]): Delta[] => {
	const byAccount = Object.groupBy(sharesOf(deltas), (s) => s.account);

	return Object.keys(byAccount)
		.toSorted(byPath)
		.flatMap((account) => {
			const byDay = Object.groupBy(byAccount[account] ?? [], (s) => textOf(s.bucket));

			return Object.keys(byDay)
				.toSorted((a, b) => Temporal.PlainDate.compare(a, b))
				.flatMap((day) => {
					const g = byDay[day];
					return g?.[0] ? [{ ...g[0], ...added(g[0], g) }] : [];
				});
		});
};

/**
 * Each account's gain and its parents' over every bucket, by path, leaving out
 * those not drawn.
 */
const totalsOf = (deltas: Delta[], parents: Record<string, string | null>): Total[] => {
	const groups = Object.groupBy(sharesOf(deltas), (s) => s.account);
	return Object.entries(groups)
		.flatMap(([account, g]) =>
			g?.[0] && Object.hasOwn(parents, account)
				? [{ account, parent: parents[account] ?? null, ...added(g[0], g) }]
				: [],
		)
		.toSorted((a, b) => byPath(a.account, b.account));
};

/**
 * Each amount once for its own account and once for each parent, which adds up
 * the accounts under it.
 */
const sharesOf = (r: Delta[]) =>
	r.flatMap((s) => parentsOf(s.account).map((a) => ({ ...s, account: a })));

const added = (head: Delta, deltas: Delta[]) => ({
	first: deltas.reduce((a, s) => (textOf(a) <= textOf(s.first) ? a : s.first), head.first),
	amount: sum(deltas.map((s) => s.amount)),
	inflow: sum(deltas.map((s) => s.inflow)),
	outflow: sum(deltas.map((s) => s.outflow)),
	unpriced: deltas.reduce((n, s) => n + s.unpriced, 0),
});

/**
 * What these accounts gained on one day of the month, averaged over the months
 * of a span that have it.
 */
export type Daily = { day: number; amount: Amount; unpriced: number };

/**
 * Every day of the month from the 1st to the 31st, dated in the reference
 * January the adapter buckets them in.
 */
export const dailyOf = (deltas: Delta[], span: Span): Daily[] => {
	const days = Object.groupBy(deltas, (s) => s.bucket.day);

	return Array.from({ length: 31 }, (_, i) => {
		const rows = days[i + 1] ?? [];
		const months = Math.max(monthsWith(i + 1, span), 1);

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
