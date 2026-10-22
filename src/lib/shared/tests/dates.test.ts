import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { bucketsIn, Day, previousOf, startOf } from '#lib/shared/dates.ts';

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
