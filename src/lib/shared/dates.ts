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

/** The first day a range covers, counting back from its last. */
export const startOf: Record<Range, (last: Temporal.PlainDate) => Temporal.PlainDate> = {
	'1m': (d) => d.subtract({ months: 1 }),
	ytd: (d) => d.with({ month: 1, day: 1 }),
	'1y': (d) => d.subtract({ years: 1 }),
	all: () => Temporal.PlainDate.from('0001-01-01'),
};
