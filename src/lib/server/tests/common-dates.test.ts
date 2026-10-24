import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	bucketsIn,
	coverOf,
	Day,
	Period,
	periodOf,
	previousOf,
	spansOf,
	startOf,
} from '#lib/shared/dates.ts';

const day = (iso: string) => Temporal.PlainDate.from(iso);

describe('a day', () => {
	it('reads an ISO date, and refuses anything else', () => {
		expect(v.parse(Day, '2026-10-21').equals(day('2026-10-21'))).toBe(true);
		expect(v.safeParse(Day, '21/10/2026').success).toBe(false);
	});
});

describe('a range', () => {
	it('starts a month, a year, the year’s first day, or the first day ever before its last', () => {
		const last = day('2026-03-31');
		expect(startOf['1m'](last).toString()).toBe('2026-02-28');
		expect(startOf.ytd(last).toString()).toBe('2026-01-01');
		expect(startOf['1y'](last).toString()).toBe('2025-03-31');
		expect(startOf.all(last).toString()).toBe('0001-01-01');
	});
});

describe('the range before', () => {
	it('is as long, or as far into the year before, and all has none', () => {
		const last = day('2026-03-31');
		const span = (r: keyof typeof previousOf) => {
			const before = previousOf[r](last);
			return before && `${before.from}..${before.to}`;
		};
		expect(span('1m')).toBe('2026-01-31..2026-02-27');
		expect(span('ytd')).toBe('2025-01-01..2025-03-31');
		expect(span('1y')).toBe('2024-03-31..2025-03-30');
		expect(span('all')).toBeNull();
	});
});

describe('buckets', () => {
	it('start on the first day of every day, month or year a span touches', () => {
		const span = { from: day('2025-11-15'), to: day('2026-01-02') };
		expect(bucketsIn(span, 'month').map(String)).toEqual([
			'2025-11-01',
			'2025-12-01',
			'2026-01-01',
		]);
		expect(bucketsIn(span, 'year').map(String)).toEqual(['2025-01-01', '2026-01-01']);
		expect(bucketsIn({ from: span.to, to: span.to }, 'day').map(String)).toEqual(['2026-01-02']);
	});
});

describe('a cover', () => {
	it('runs from the earliest first day to the latest last day, and is none without spans', () => {
		const spans = [
			{ from: day('2026-03-01'), to: day('2026-03-31') },
			{ from: day('1998-07-15'), to: day('1998-07-15') },
			{ from: day('2024-01-01'), to: day('2026-02-01') },
		];
		const cover = coverOf(spans);
		expect(cover && `${cover.from}..${cover.to}`).toBe('1998-07-15..2026-03-31');
		expect(coverOf([])).toBeNull();
	});
});

describe('a period', () => {
	const TODAY = '2026-10-24';
	const read = (query: string) => periodOf(new URLSearchParams(query), TODAY);

	it('is a month or year by name, all of history, or the days between two', () => {
		expect(read('at=2026-03')).toEqual({ kind: 'month', at: '2026-03' });
		expect(read('at=2024')).toEqual({ kind: 'year', at: '2024' });
		expect(read('range=all')).toEqual({ kind: 'all' });
		expect(read('from=2026-01-05&to=2026-02-10')).toEqual({
			kind: 'custom',
			from: '2026-01-05',
			to: '2026-02-10',
		});
	});

	it('is this year when the URL picks none, or picks one badly', () => {
		expect(read('')).toEqual({ kind: 'year', at: '2026' });
		expect(read('at=2026-13')).toEqual({ kind: 'year', at: '2026' });
		expect(read('range=1m')).toEqual({ kind: 'year', at: '2026' });
		expect(read('from=2026-02-30&to=2026-03-01')).toEqual({ kind: 'year', at: '2026' });
		expect(read('from=2026-03-01&to=2026-02-01')).toEqual({ kind: 'year', at: '2026' });
	});

	it('refuses days that are only shaped like one', () => {
		expect(v.is(Period, { kind: 'custom', from: '2026-02-30', to: '2026-03-01' })).toBe(false);
	});
});

describe('a period’s spans', () => {
	const spans = (period: Period, today: string) => {
		const { current, previous, bucket } = spansOf(period, day(today));
		return [`${current.from}..${current.to}`, `${previous?.from}..${previous?.to}`, bucket];
	};

	it('runs a month or year to today while it lasts, against the one before as far in', () => {
		expect(spans({ kind: 'month', at: '2026-10' }, '2026-10-24')).toEqual([
			'2026-10-01..2026-10-24',
			'2026-09-01..2026-09-24',
			'day',
		]);
		expect(spans({ kind: 'year', at: '2026' }, '2026-10-24')).toEqual([
			'2026-01-01..2026-10-24',
			'2025-01-01..2025-10-24',
			'month',
		]);
	});

	it('covers a past month or year whole, against the whole one before', () => {
		expect(spans({ kind: 'month', at: '2026-03' }, '2026-10-24')).toEqual([
			'2026-03-01..2026-03-31',
			'2026-02-01..2026-02-28',
			'day',
		]);
		expect(spans({ kind: 'year', at: '2024' }, '2026-10-24')).toEqual([
			'2024-01-01..2024-12-31',
			'2023-01-01..2023-12-31',
			'month',
		]);
	});

	it('starts a month yet to come on today', () => {
		expect(spans({ kind: 'month', at: '2027-01' }, '2026-10-24')[0]).toBe('2026-10-24..2026-10-24');
	});

	it('covers all of history by the year, with nothing before', () => {
		expect(spans({ kind: 'all' }, '2026-10-24')).toEqual([
			'0001-01-01..2026-10-24',
			'undefined..undefined',
			'year',
		]);
	});

	it('weighs days against as many just before them', () => {
		expect(spans({ kind: 'custom', from: '2026-03-10', to: '2026-03-19' }, '2026-10-24')).toEqual([
			'2026-03-10..2026-03-19',
			'2026-02-28..2026-03-09',
			'day',
		]);
	});

	it('bars days by the day up to a month, by the month up to three years, then by the year', () => {
		const bucket = (from: string, to: string) =>
			spansOf({ kind: 'custom', from, to }, day(to)).bucket;
		expect(bucket('2026-01-01', '2026-01-31')).toBe('day');
		expect(bucket('2026-01-01', '2026-02-01')).toBe('month');
		expect(bucket('2023-01-01', '2025-12-31')).toBe('month');
		expect(bucket('2023-01-01', '2026-01-01')).toBe('year');
	});
});
