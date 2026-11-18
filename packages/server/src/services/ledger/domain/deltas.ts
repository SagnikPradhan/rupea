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
	transaction?: string;
	position?: number;
};

/** A delta with only the measures asked for. */
export type Row = {
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
	transaction?: string;
	position?: number;
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
	series?: Series[];
};

/**
 * A holding's units and price in the base at the end of every day of a span, as
 * floats, with no price as NaN. A read gives them beside its rows when asked,
 * for a report that goes through every day and reads no money from them.
 */
export type Series = {
	account: string;
	commodity: string;
	units: Float64Array;
	prices: Float64Array;
};

type BalancesOfOptions = {
	span: Span;
	base: string;
	bucket: Bucket | 'posting';
	aggregate: Aggregate;
	measures: Measure[];
	parents: Record<string, string | null>;
};

const compareKeys = new Intl.Collator('en', { numeric: true }).compare;

export const balancesOf = (
	deltas: Delta[],
	{ span, base, bucket, aggregate, measures, parents }: BalancesOfOptions,
): Balances => {
	if (bucket === 'posting')
		return { from: span.from, to: span.to, base, rows: deltas.map(postingRow) };

	const rows = rolledUp(deltas, {
		byCommodity: isByCommodity(measures),
		measures,
		parents,
	});
	if (aggregate === 'average' && bucket === 'day') rows.forEach(averaged(monthsByDay(span)));

	return { from: span.from, to: span.to, base, rows };
};

/** A posting alone, as a row with its value, transaction and position. */
const postingRow = (d: Delta): Row => ({
	account: d.account,
	commodity: d.commodity,
	bucket: d.bucket,
	unpriced: d.unpriced,
	value: d.value,
	...(d.transaction === undefined ? {} : { transaction: d.transaction, position: d.position ?? 0 }),
});

type Column = { account: string; totals: Row[] };

type RolledUpOptions = {
	byCommodity: boolean;
	measures: Measure[];
	parents: Record<string, string | null>;
};

/**
 * Each account's gain and its parents', by path, bucket and then commodity when
 * they are told apart, for the accounts there are, with the measures asked for.
 * Each amount counts once for its own account and once for each parent, which
 * adds up the accounts under it.
 */
const rolledUp = (deltas: Delta[], { byCommodity, measures, parents }: RolledUpOptions) => {
	const added = measures.filter(isAdded);
	const priced = measures.includes('price');
	const totals = new Map<string, Map<string, Row[]>>();
	const places = new Map<string, number>();
	const helds = new Set<string>();
	const run = { account: '', held: '', columns: [] as Column[] };

	const columnsOf = (own: string, held: string) =>
		parentsOf(own).map((account) => ({
			account,
			totals: totals
				.getOrInsertComputed(account, () => new Map())
				.getOrInsertComputed(held, () => []),
		}));

	for (const s of deltas) {
		const held = byCommodity ? (s.commodity ?? '') : '';
		const place = places.get(s.bucket) ?? places.size;
		places.set(s.bucket, place);
		if (s.account !== run.account || held !== run.held) {
			helds.add(held);
			Object.assign(run, { account: s.account, held, columns: columnsOf(s.account, held) });
		}

		for (const column of run.columns) {
			const total = column.totals[place] ?? totalIn(column, { s, place, byCommodity });
			addedTo(total, s, { added, priced });
		}
	}

	const bucketOrder = [...places]
		.toSorted(([a], [b]) => compareKeys(a, b))
		.map(([, place]) => place);
	const heldOrder = [...helds].toSorted(compareKeys);
	const accounts = [...totals.keys()].filter((a) => Object.hasOwn(parents, a)).toSorted(byPath);

	return accounts.flatMap((account) => {
		const byHeld = heldOrder.map((h) => totals.get(account)?.get(h)).filter((c) => c !== undefined);

		return bucketOrder.flatMap((p) => byHeld.flatMap((c) => c[p] ?? []));
	});
};

const addedTo = (total: Row, s: Delta, { added, priced }: { added: Added[]; priced: boolean }) => {
	total.unpriced += s.unpriced;
	for (const m of added) total[m] = plus(total[m], s[m]);
	if (priced && s.price) total.price ??= s.price;
};

const totalIn = (
	column: Column,
	{ s, place, byCommodity }: { s: Delta; place: number; byCommodity: boolean },
) => {
	const total: Row = {
		account: column.account,
		commodity: byCommodity ? s.commodity : null,
		bucket: s.bucket,
		unpriced: 0,
	};
	column.totals[place] = total;

	return total;
};

const plus = (t: Amount | undefined, g: Amount) => (t === undefined ? g : ((t + g) as Amount));

type Added = Exclude<Measure, 'price'>;

const isAdded = (m: Measure): m is Added => m !== 'price';

/** A day of the month's amounts divided by how many months of the span have it. */
const averaged = (monthsOf: Record<number, number>) => (row: Row) => {
	const times = BigInt(Math.max(monthsOf[Number(row.bucket)] ?? 1, 1));

	for (const m of ['value', 'inflow', 'outflow'] as const)
		if (row[m] !== undefined) row[m] = (row[m] / times) as Amount;
};

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
