import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, formatMoment, formatSize } from '#lib/web/format.ts';

describe('formatAmount', () => {
	it('groups digits the Indian way, keeping two decimals at least', () => {
		expect(formatAmount('1250000')).toBe('12,50,000.00');
		expect(formatAmount('-1250.5')).toBe('-1,250.50');
	});

	it('keeps every fraction digit an amount has', () => {
		expect(formatAmount('0.123456789')).toBe('0.123456789');
	});

	it('keeps the commodity after the number', () => {
		expect(formatAmount('10 INFY')).toBe('10.00 INFY');
	});
});

describe('formatDate', () => {
	it('reads an ISO date as the same day, whatever the time zone', () => {
		expect(formatDate('2026-01-02')).toBe('2 Jan 2026');
	});
});

describe('formatMoment', () => {
	it('names the day of a moment', () => {
		expect(formatMoment(new Date(2026, 7, 29, 12))).toBe('29 Aug 2026');
	});
});

describe('formatSize', () => {
	it.each([
		[0, '0 B'],
		[999, '999 B'],
		[1200, '1.2 kB'],
		[3_400_000, '3.4 MB'],
		[5_000_000_000, '5,000 MB'],
	])('formats %i bytes as %s', (bytes, text) => {
		expect(formatSize(bytes)).toBe(text);
	});
});
