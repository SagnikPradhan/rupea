import * as v from 'valibot';

/** A day as the viewer's calendar shows it, sent as an ISO date like `2026-10-21`. */
export const Day = v.pipe(
	v.string(),
	v.isoDate(),
	v.transform((d) => Temporal.PlainDate.from(d)),
);

/** The spans a chart or list of a ledger's history covers. */
export const Range = v.picklist(['1m', 'ytd', '1y', 'all']);

export type Range = v.InferOutput<typeof Range>;

/** How the range picker labels each range. */
export const RANGE_LABELS: Record<Range, string> = {
	'1m': '1M',
	ytd: 'YTD',
	'1y': '1Y',
	all: 'All',
};

/** The first day of all of history, which a ledger starts long after. */
export const BEGINNING = '0001-01-01';

/** The first day a range covers, counting back from its last. */
export const startOf: Record<Range, (last: Temporal.PlainDate) => Temporal.PlainDate> = {
	'1m': (d) => d.subtract({ months: 1 }),
	ytd: (d) => d.with({ month: 1, day: 1 }),
	'1y': (d) => d.subtract({ years: 1 }),
	all: () => Temporal.PlainDate.from(BEGINNING),
};

/** The first and last day of a span, both included. */
export type Span = { from: Temporal.PlainDate; to: Temporal.PlainDate };

/** The first day of the earliest span to the last day of the latest, or none without spans. */
export const coverOf = (spans: Span[]): Span | null => {
	const days = spans.flatMap((s) => [s.from, s.to]).toSorted(Temporal.PlainDate.compare);
	const [from, to] = [days.at(0), days.at(-1)];
	return from && to ? { from, to } : null;
};

/** The one before a range, as long and as far into its year, which its spending is weighed against; all has none. */
export const previousOf: Record<Range, (last: Temporal.PlainDate) => Span | null> = {
	'1m': (d) => ({ from: d.subtract({ months: 2 }), to: d.subtract({ months: 1, days: 1 }) }),
	ytd: (d) => ({
		from: d.with({ month: 1, day: 1 }).subtract({ years: 1 }),
		to: d.subtract({ years: 1 }),
	}),
	'1y': (d) => ({ from: d.subtract({ years: 2 }), to: d.subtract({ years: 1, days: 1 }) }),
	all: () => null,
};

/** The days a chart adds up into one bar. */
export type Bucket = 'day' | 'month' | 'year';

/** A range's bars: a month by day, a year by month, and all of history by year. */
export const BUCKETS: Record<Range, Bucket> = {
	'1m': 'day',
	ytd: 'month',
	'1y': 'month',
	all: 'year',
};

const UNITS = { day: 'days', month: 'months', year: 'years' } as const;

/** The first day of the bucket a day falls in. */
const bucketOf: Record<Bucket, (d: Temporal.PlainDate) => Temporal.PlainDate> = {
	day: (d) => d,
	month: (d) => d.with({ day: 1 }),
	year: (d) => d.with({ month: 1, day: 1 }),
};

/** The first day of every bucket a span touches, oldest first. */
export const bucketsIn = (span: Span, bucket: Bucket) => {
	const unit = UNITS[bucket];
	const first = bucketOf[bucket](span.from);
	const count = first.until(span.to, { largestUnit: unit })[unit] + 1;

	return Array.from({ length: count }, (_, i) => first.add({ [unit]: i }));
};
