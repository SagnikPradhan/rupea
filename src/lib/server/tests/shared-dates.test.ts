import {
	DATE_FORMATS,
	isDateFormat,
	isTimeFormat,
	parseDate,
	parseTime,
	TIME_FORMATS,
} from '#lib/server/shared/dates.ts';
import { describe, expect, it } from 'vitest';

describe('reading a date', () => {
	it.each([
		['yyyy-MM-dd', '2026-08-29'],
		['dd/MM/yyyy', '29/08/2026'],
		['d MMM yyyy', '29 Aug 2026'],
		['d MMM yyyy', '29 aug 2026'],
		['yyyyMMdd', '20260829'],
	])('parses %j / %j', (format, text) => {
		expect(parseDate({ format, text })).toEqual(Temporal.PlainDate.from('2026-08-29'));
	});

	it.each([
		['yyyy-MM-dd', '2026-02-30'],
		['yyyy-MM-dd', '2026-13-01'],
		['yyyy-MM-dd', '2026-00-10'],
		['yyyy-MM-dd', '29/08/2026'],
		['yyyy-MM-dd', '2026-08-29x'],
		['yyyy-MM-dd', '2026-8-29'],
		['dd/MM/yyyy', '29/08/26'],
		['d/M/yyyy', '29/08/2026'],
	])('rejects %j / %j', (ft, tx) => {
		expect(parseDate({ format: ft, text: tx })).toBeNull();
	});
});

describe('reading a time', () => {
	it.each([
		['HH:mm', '14:30', '14:30'],
		['H:mm', '9:05', '09:05'],
		['HH:mm:ss', '14:30:15', '14:30:15'],
		['h:mm a', '2:30 PM', '14:30'],
		['h:mm a', '12:15 am', '00:15'],
	])('parses %j / %j', (fmt, txt, tim) => {
		expect(parseTime({ format: fmt, text: txt })).toEqual(Temporal.PlainTime.from(tim));
	});

	it.each([
		['HH:mm', '24:00'],
		['HH:mm', '14:60'],
		['HH:mm', '9:05'],
		['HH:mm', 'Groceries'],
	])('rejects %j / %j', (ft, tx) => {
		expect(parseTime({ format: ft, text: tx })).toBeNull();
	});
});

describe('date formats', () => {
	it.each([...DATE_FORMATS, 'yyyy-MM-dd HH:mm'])('accepts %j', (ft) => {
		expect(isDateFormat(ft)).toBe(true);
	});

	it.each(['yyyy-MM', 'MM-dd', 'yy-MM-dd'])('rejects %j', (ft) => {
		expect(isDateFormat(ft)).toBe(false);
	});

	it('throws on unknown tokens', () => {
		expect(() => isDateFormat('%Y-%m-%d')).toThrow(RangeError);
	});
});

describe('time formats', () => {
	it.each(TIME_FORMATS)('accepts %j', (ft) => {
		expect(isTimeFormat(ft)).toBe(true);
	});

	it.each(['HH', 'mm:ss', 'h:mm'])('rejects %j', (ft) => {
		expect(isTimeFormat(ft)).toBe(false);
	});
});
