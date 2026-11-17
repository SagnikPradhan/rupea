import {
	isByCommodity,
	type Aggregate,
	type Bucket,
	type Measure,
} from '@rupea/shared/balances.ts';
import { bucketsIn, type Span } from '@rupea/shared/dates.ts';
import { type Amount, type Quantity } from './amounts';
import { byPath, parentsOf } from './taxonomy';

/**
 * What one account gained in the base over one bucket, how much came in and
 * went out to make that, and how many of its amounts had no price. A bucket is
 * a date as 2026-10-05, a day of the month, a month as 2026-10, or a year as
 * 2026. A historical balance also has the units held and what the lots held
 * cost, converted at the end of the bucket and, as paid, at the prices of the
 * days they were bought. The commodity is null when every commodity is added.
 */
export type Delta = {
	account: string;
	commodity: string | null;
	bucket: string;
	value: Amount;
	inflow: Amount;
	outflow: Amount;
	units: Amount;
	cost: Amount;
	paid: Amount;
	price: Quantity | null;
	unpriced: number;
};

/** A delta with only the measures asked for. */
type Row = {
	account: string;
	commodity: string | null;
	bucket: string;
	unpriced: number;
	value?: Amount;
	inflow?: Amount;
	outflow?: Amount;
	units?: Amount;
	cost?: Amount;
	paid?: Amount;
	price?: Quantity;
};

/**
 * The first and last day a span covers, the currency its amounts are in, and
 * what each account drawn gained in each bucket.
 */
export type Balances = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	base: string;
	rows: Row[];
};

type BalancesOfOptions = {
	span: Span;
	base: string;
	bucket: Bucket;
	aggregate: Aggregate;
	measures: Measure[];
	parents: Record<string, string | null>;
};

const compareKeys = new Intl.Collator('en', { numeric: true }).compare;

export const balancesOf = (
	deltas: Delta[],
	{ span, base, bucket, aggregate, measures, parents }: BalancesOfOptions,
): Balances => {
	const drawn = rolledUp(deltas, isByCommodity(measures)).filter((d) =>
		Object.hasOwn(parents, d.account),
	);
	const averages = aggregate === 'average' && bucket === 'day';
	const times = averages ? monthsByDay(span) : {};
	const rows = averages ? drawn.map((d) => averaged(d, times)) : drawn;

	return { from: span.from, to: span.to, base, rows: rows.map((r) => measured(r, measures)) };
};

/**
 * Each account's gain and its parents', by path, bucket and then commodity when
 * they are told apart. Each amount counts once for its own account and once for
 * each parent, which adds up the accounts under it.
 */
const rolledUp = (deltas: Delta[], byCommodity: boolean): Delta[] => {
	const chains = new Map<string, string[]>();
	const totals = new Map<string, Map<string, Map<string, Delta>>>();
	for (const s of deltas) {
		const held = byCommodity ? (s.commodity ?? '') : '';

		for (const account of chains.getOrInsertComputed(s.account, parentsOf)) {
			const total = totals
				.getOrInsertComputed(account, () => new Map())
				.getOrInsertComputed(s.bucket, () => new Map())
				.getOrInsertComputed(held, () => ({
					...NOTHING,
					account,
					bucket: s.bucket,
					commodity: byCommodity ? s.commodity : null,
				}));

			addTo(total, s);
		}
	}

	return [...totals.keys()].toSorted(byPath).flatMap((account) => {
		const byBucket = totals.get(account) ?? new Map<string, Map<string, Delta>>();
		return [...byBucket.keys()].toSorted(compareKeys).flatMap((bucket) => {
			const byHeld = byBucket.get(bucket) ?? new Map<string, Delta>();
			return [...byHeld.keys()].toSorted(compareKeys).flatMap((h) => byHeld.get(h) ?? []);
		});
	});
};

const NOTHING = {
	value: 0n as Amount,
	inflow: 0n as Amount,
	outflow: 0n as Amount,
	units: 0n as Amount,
	cost: 0n as Amount,
	paid: 0n as Amount,
	price: null,
	unpriced: 0,
};

/** The first price a total sees stays, as a bucket's price is its first. */
const addTo = (t: Delta, s: Delta) => {
	t.value = (t.value + s.value) as Amount;
	t.inflow = (t.inflow + s.inflow) as Amount;
	t.outflow = (t.outflow + s.outflow) as Amount;
	t.units = (t.units + s.units) as Amount;
	t.cost = (t.cost + s.cost) as Amount;
	t.paid = (t.paid + s.paid) as Amount;
	t.price ??= s.price;
	t.unpriced += s.unpriced;
};

/** A day of the month's amounts divided by how many months of the span have it. */
const averaged = (d: Delta, monthsOf: Record<number, number>) => {
	const times = BigInt(Math.max(monthsOf[Number(d.bucket)] ?? 1, 1));

	return {
		...d,
		value: (d.value / times) as Amount,
		inflow: (d.inflow / times) as Amount,
		outflow: (d.outflow / times) as Amount,
	};
};

const measured = (d: Delta, measures: Measure[]) => ({
	account: d.account,
	commodity: d.commodity,
	bucket: d.bucket,
	unpriced: d.unpriced,
	...(measures.includes('value') && { value: d.value }),
	...(measures.includes('inflow') && { inflow: d.inflow }),
	...(measures.includes('outflow') && { outflow: d.outflow }),
	...(measures.includes('units') && { units: d.units }),
	...(measures.includes('cost') && { cost: d.cost }),
	...(measures.includes('paid') && { paid: d.paid }),
	...(measures.includes('price') && d.price && { price: d.price }),
});

/** How many months of a span have each day of the month inside it. */
const monthsByDay = (span: Span) => {
	const counts: Record<number, number> = {};

	for (const month of bucketsIn(span, 'month')) {
		const first = Temporal.PlainDate.compare(month, span.from) > 0 ? month : span.from;
		const end = month.with({ day: month.daysInMonth });
		const last = Temporal.PlainDate.compare(end, span.to) < 0 ? end : span.to;

		const days = Array.from({ length: last.day - first.day + 1 }, (_, i) => first.day + i);
		for (const day of days) counts[day] = (counts[day] ?? 0) + 1;
	}

	return counts;
};
