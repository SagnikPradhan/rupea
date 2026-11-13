import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	bucketsIn,
	coverOf,
	Day,
	monthlyDaysIn,
	DayOut,
	Instant,
	InstantOut,
	Period,
	spansOf,
} from '@rupea/shared/dates.ts';

const day = (iso: string) => Temporal.PlainDate.from(iso);

describe('a day', () => {
	it('reads an ISO date, and refuses anything else', () => {
		expect(v.parse(Day, '2026-10-21').equals(day('2026-10-21'))).toBe(true);
		expect(v.safeParse(Day, '21/10/2026').success).toBe(false);
	});

	it('refuses a date the calendar does not have', () => {
		expect(v.safeParse(Day, '2026-02-30').success).toBe(false);
	});

	it('refuses a year outside 0000 to 9999, so every day it reads can go out', () => {
		const outside = ['+010000-01-01', '-000001-12-31', '10000-01-01'];
		expect(outside.filter((text) => v.safeParse(Day, text).success)).toEqual([]);

		const edges = ['0000-01-01', '9999-12-31'];
		expect(edges.map((text) => v.parse(DayOut, v.parse(Day, text)))).toEqual(edges);
	});

	it('goes out as the ISO date it reads back', () => {
		const text = v.parse(DayOut, day('2026-10-21'));
		expect(text).toBe('2026-10-21');
		expect(v.parse(Day, text).equals(day('2026-10-21'))).toBe(true);
		expect(v.safeParse(DayOut, '2026-10-21').success).toBe(false);
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

describe('a day of each month', () => {
	it('falls in every month of a span, none before or after it', () => {
		const span = { from: day('2026-01-20'), to: day('2026-04-10') };
		expect(monthlyDaysIn(span, 15).map(String)).toEqual(['2026-02-15', '2026-03-15']);
	});

	it('moves to the last day of a month too short for it', () => {
		const span = { from: day('2026-01-01'), to: day('2026-03-31') };
		expect(monthlyDaysIn(span, 31).map(String)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
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

	it('cuts days picked past today short at today', () => {
		expect(spans({ kind: 'custom', from: '2026-10-20', to: '2026-12-31' }, '2026-10-24')[0]).toBe(
			'2026-10-20..2026-10-24',
		);
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

describe('an instant', () => {
	it('reads an ISO timestamp, and refuses anything else', () => {
		const read = v.parse(Instant, '2026-10-21T09:30:00Z');
		expect(read.equals(Temporal.Instant.from('2026-10-21T09:30:00Z'))).toBe(true);
		expect(v.safeParse(Instant, '2026-10-21').success).toBe(false);
		expect(v.safeParse(Instant, '2026-02-30T09:30:00Z').success).toBe(false);
	});

	it('goes out as the timestamp it reads back', () => {
		const instant = Temporal.Instant.from('2026-10-21T09:30:00.5Z');
		const text = v.parse(InstantOut, instant);
		expect(v.parse(Instant, text).equals(instant)).toBe(true);
		expect(v.safeParse(InstantOut, '2026-10-21T09:30:00Z').success).toBe(false);
	});
});
