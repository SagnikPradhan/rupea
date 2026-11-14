import {
	isByCommodity,
	type Aggregate,
	type Bucket,
	type Measure,
} from '@rupea/shared/balances.ts';
import { bucketsIn, type Span } from '@rupea/shared/dates.ts';
import { sum, type Amount, type Quantity } from './amounts';
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

const byBucket = new Intl.Collator('en', { numeric: true }).compare;

export const balancesOf = (
	deltas: Delta[],
	{ span, base, bucket, aggregate, measures, parents }: BalancesOfOptions,
): Balances => {
	const own = isByCommodity(measures) ? deltas : deltas.map((d) => ({ ...d, commodity: null }));
	const drawn = rolledUp(own).filter((d) => Object.hasOwn(parents, d.account));
	const averages = aggregate === 'average' && bucket === 'day';
	const times = averages ? monthsByDay(span) : {};
	const rows = averages ? drawn.map((d) => averaged(d, times)) : drawn;

	return { from: span.from, to: span.to, base, rows: rows.map((r) => measured(r, measures)) };
};

/** Each account's gain and its parents', by path, bucket and then commodity. */
const rolledUp = (deltas: Delta[]): Delta[] => {
	const byAccount = Object.groupBy(sharesOf(deltas), (s) => s.account);

	return Object.keys(byAccount)
		.toSorted(byPath)
		.flatMap((account) => {
			const byKey = Object.groupBy(byAccount[account] ?? [], (s) => s.bucket);

			return Object.keys(byKey)
				.toSorted(byBucket)
				.flatMap((key) => {
					const byHeld = Object.groupBy(byKey[key] ?? [], (s) => s.commodity ?? '');

					return Object.keys(byHeld)
						.toSorted(byBucket)
						.flatMap((held) => {
							const g = byHeld[held];
							return g?.[0] ? [{ ...g[0], ...added(g) }] : [];
						});
				});
		});
};

/**
 * Each amount once for its own account and once for each parent, which adds up
 * the accounts under it.
 */
const sharesOf = (r: Delta[]) =>
	r.flatMap((s) => parentsOf(s.account).map((a) => ({ ...s, account: a })));

const added = (deltas: Delta[]) => ({
	value: sum(deltas.map((s) => s.value)),
	inflow: sum(deltas.map((s) => s.inflow)),
	outflow: sum(deltas.map((s) => s.outflow)),
	units: sum(deltas.map((s) => s.units)),
	cost: sum(deltas.map((s) => s.cost)),
	paid: sum(deltas.map((s) => s.paid)),
	price: deltas.find((s) => s.price)?.price ?? null,
	unpriced: deltas.reduce((n, s) => n + s.unpriced, 0),
});

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
	const months = bucketsIn(span, 'month');
	const days = Array.from({ length: 31 }, (_, i) => i + 1);

	return Object.fromEntries(days.map((d) => [d, monthsWith(d, { months, span })]));
};

const monthsWith = (day: number, { months, span }: { months: Temporal.PlainDate[]; span: Span }) =>
	months.filter((m) => {
		if (m.daysInMonth < day) return false;
		const on = m.with({ day });
		return (
			Temporal.PlainDate.compare(on, span.from) >= 0 && Temporal.PlainDate.compare(on, span.to) <= 0
		);
	}).length;
