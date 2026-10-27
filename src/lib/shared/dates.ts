import * as v from 'valibot';

/** A day as the viewer's calendar shows it, sent as an ISO date like `2026-10-21`. */
export const Day = v.pipe(
	v.string(),
	v.isoDate(),
	v.transform((d) => Temporal.PlainDate.from(d)),
);

/** The first day of all of history, which a ledger starts long after. */
export const BEGINNING = '0001-01-01';

/** The first and last day of a span, both included. */
export type Span = { from: Temporal.PlainDate; to: Temporal.PlainDate };

/** The first day of the earliest span to the last day of the latest, or none without spans. */
export const coverOf = (spans: Span[]): Span | null => {
	const days = spans.flatMap((s) => [s.from, s.to]).toSorted(Temporal.PlainDate.compare);
	const [from, to] = [days.at(0), days.at(-1)];
	return from && to ? { from, to } : null;
};

/** The days a chart adds up into one bar. */
export type Bucket = 'day' | 'month' | 'year';

const MONTH_NAME = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_NAME = /^\d{4}$/;

/** Bars by the day up to a month, and by the month up to three years. */
const MOST_DAYS = 31;
const MOST_MONTHS = 36;

/** An ISO date only has the right shape, so 2026-02-30 passes it; a day that exists comes back the same. */
const exists = (d: string) =>
	!Number.isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d);

/** An ISO day that exists, kept as text. */
const IsoDay = v.pipe(v.string(), v.isoDate(), v.check(exists));

/** What a page of a ledger's history covers: a calendar month or year, all of history, or the days between two. */
export const Period = v.variant('kind', [
	v.object({ kind: v.literal('month'), at: v.pipe(v.string(), v.regex(MONTH_NAME)) }),
	v.object({ kind: v.literal('year'), at: v.pipe(v.string(), v.regex(YEAR_NAME)) }),
	v.object({ kind: v.literal('all') }),
	v.pipe(
		v.object({ kind: v.literal('custom'), from: IsoDay, to: IsoDay }),
		v.check((p) => p.from <= p.to),
	),
]);

export type Period = v.InferOutput<typeof Period>;

/** The period a URL picks with at, range=all, or from and to; the fallback when it picks none. */
export const periodOf = (
	params: { get: (key: string) => string | null },
	fallback: Period,
): Period => {
	const at = params.get('at');
	const picked = [
		{ kind: 'month', at },
		{ kind: 'year', at },
		{ kind: params.get('range') },
		{ kind: 'custom', from: params.get('from'), to: params.get('to') },
	].find((p) => v.is(Period, p));

	return picked ?? fallback;
};

/** The URL parameters that pick a period, as periodOf reads them. */
export const paramsOf = (period: Period): Record<string, string> => {
	if (period.kind === 'all') return { range: 'all' };
	if (period.kind === 'custom') return { from: period.from, to: period.to };

	return { at: period.at };
};

/** What a chart of spending covers: its span, the one before to weigh it against, and its buckets. */
type Spans = { current: Span; previous: Span | null; bucket: Bucket };

/** A period's spans, each cut short at the day; a month or year is weighed against the one before, as far in, and days against as many before them. */
export const spansOf = (period: Period, day: Temporal.PlainDate): Spans => {
	if (period.kind === 'all') return spansEver(day);
	if (period.kind === 'custom') return spansBetween(period, day);

	return spansIn(period, day);
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

const CALENDARS = {
	month: { unit: 'months', bucket: 'day', first: (a: string) => `${a}-01` },
	year: { unit: 'years', bucket: 'month', first: (a: string) => `${a}-01-01` },
} as const;

/** A month or a year against the one before it, as far in. */
const spansIn = (
	period: { kind: 'month' | 'year'; at: string },
	day: Temporal.PlainDate,
): Spans => {
	const { unit, bucket, first } = CALENDARS[period.kind];
	const start = Temporal.PlainDate.from(first(period.at));
	const before = start.subtract({ [unit]: 1 });

	return {
		current: calendarSpan(start, unit, day),
		previous: calendarSpan(before, unit, day.subtract({ [unit]: 1 })),
		bucket,
	};
};

/** Days picked by hand, against as many days just before them. */
const spansBetween = (period: { from: string; to: string }, day: Temporal.PlainDate): Spans => {
	const from = Temporal.PlainDate.from(period.from);
	const to = earlier(Temporal.PlainDate.from(period.to), day);
	const days = from.until(to).days + 1;

	return {
		current: { from, to },
		previous: { from: from.subtract({ days }), to: from.subtract({ days: 1 }) },
		bucket: bucketBetween(from, to),
	};
};

/** All of history by the year, with nothing before it. */
const spansEver = (day: Temporal.PlainDate): Spans => ({
	current: { from: Temporal.PlainDate.from(BEGINNING), to: day },
	previous: null,
	bucket: 'year',
});

const bucketBetween = (from: Temporal.PlainDate, to: Temporal.PlainDate): Bucket => {
	if (from.until(to).days < MOST_DAYS) return 'day';
	if (from.until(to, { largestUnit: 'months' }).months < MOST_MONTHS) return 'month';
	return 'year';
};

/** A month or year from its first day, cut short at the day while it runs; one yet to start begins on the day. */
const calendarSpan = (
	first: Temporal.PlainDate,
	unit: 'months' | 'years',
	day: Temporal.PlainDate,
) => {
	const end = first.add({ [unit]: 1 }).subtract({ days: 1 });
	return { from: earlier(first, day), to: earlier(end, day) };
};

const earlier = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(a, b) > 0 ? b : a;
