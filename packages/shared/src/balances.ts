import * as v from 'valibot';
import { bucketsIn, type Grain, type Span } from './dates.ts';

/**
 * What a read of balances adds amounts up by: a calendar day, the day of the
 * month, a month or a year. A day of the month puts every month's day n in one
 * bucket, so a long span folds its months together.
 */
export const Bucket = v.picklist(['date', 'day', 'month', 'year']);

export type Bucket = v.InferOutput<typeof Bucket>;

/** Whether a bucket the span comes to more than once adds up or averages. */
export const Aggregate = v.picklist(['sum', 'average']);

export type Aggregate = v.InferOutput<typeof Aggregate>;

/**
 * What a row of balances carries: the net, what came in and went out, which a
 * change has; and the units held, what they cost, what was paid for them and
 * their price, which a historical balance has. Cost is converted at the prices
 * of the bucket's last day, paid at the prices of the days the lots were
 * bought.
 */
export const Measure = v.picklist(['value', 'inflow', 'outflow', 'units', 'cost', 'paid', 'price']);

export type Measure = v.InferOutput<typeof Measure>;

/** The bucket that adds up what a chart draws as one bar. */
export const bucketFor: Record<Grain, Bucket> = { day: 'date', month: 'month', year: 'year' };

/**
 * What a bucket is called to the API: a date as 2026-10-05, a day of the month
 * as 5, a month as 2026-10 and a year as 2026.
 */
export const bucketKeyOf: Record<Bucket, (d: Temporal.PlainDate) => string> = {
	date: (d) => d.toString(),
	day: (d) => String(d.day),
	month: (d) => d.toString().slice(0, 7),
	year: (d) => d.toString().slice(0, 4),
};

/** Whether a read carries each bucket's change or the balance it ends on. */
export const Accumulate = v.picklist(['change', 'historical']);

export type Accumulate = v.InferOutput<typeof Accumulate>;

const CHANGES: Set<Measure> = new Set(['inflow', 'outflow']);
const HELD: Set<Measure> = new Set(['units', 'cost', 'paid', 'price']);

/**
 * Whether a read can be answered: a balance needs a bucket that ends, so not a
 * day of the month, and has no inflow or outflow; a change has no units, cost
 * or price; only a day of the month is averaged.
 */
export const isReadable = (o: {
	accumulate: Accumulate;
	aggregate: Aggregate;
	bucket: Bucket;
	measures: Measure[];
}) =>
	(o.aggregate !== 'average' || o.bucket === 'day') &&
	(o.accumulate === 'change'
		? !o.measures.some((m) => HELD.has(m))
		: o.bucket !== 'day' && !o.measures.some((m) => CHANGES.has(m)));

/** Whether rows are told apart by commodity, as the units and price of one are. */
export const isByCommodity = (m: Measure[]) => m.some((x) => x === 'units' || x === 'price');

/** The most days a span can be and still close each of them. */
export const CLOSING_DAYS = 366;

/**
 * The bucket a historical read of a span draws: each day up to a year, then
 * each month.
 */
export const closingBucketOf = (s: Span) =>
	s.from.until(s.to, { largestUnit: 'days' }).days <= CLOSING_DAYS ? 'date' : 'month';

const GRAINS: Record<Exclude<Bucket, 'day'>, Grain> = { date: 'day', month: 'month', year: 'year' };

/**
 * The days a span closes each of its buckets on, the last cut short at the
 * span.
 */
export const endsIn = (span: Span, bucket: Exclude<Bucket, 'day'>) => {
	const starts = bucketsIn(span, GRAINS[bucket]).slice(1);

	return [...starts.map((s) => s.subtract({ days: 1 })), span.to];
};
