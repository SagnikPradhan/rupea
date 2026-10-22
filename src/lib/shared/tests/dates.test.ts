import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { Day, startOf } from '#lib/shared/dates.ts';

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
