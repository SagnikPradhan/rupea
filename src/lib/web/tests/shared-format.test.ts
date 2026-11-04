import { describe, expect, it } from 'vitest';
import {
	formatAmount,
	formatWhole,
	formatChange,
	formatColumn,
	formatBucket,
	formatCompact,
	formatDate,
	formatExact,
	formatIsoDate,
	formatMoment,
	formatReturn,
	formatSize,
} from '#lib/web/shared/format.ts';

describe('formatAmount', () => {
	it('groups digits the Indian way, with no paise', () => {
		expect(formatAmount('1250000')).toBe('12,50,000');
		expect(formatAmount('-1250.5')).toBe('-1,251');
	});

	it('rounds rupees to whole ones, and units to four places', () => {
		expect(formatAmount('1250.5678')).toBe('1,251');
		expect(formatAmount('0.123456789 USD')).toBe('0.1235 USD');
		expect(formatAmount('7.123456', true)).toBe('7.1235');
	});

	it('keeps the commodity after the number', () => {
		expect(formatAmount('10 INFY')).toBe('10 INFY');
	});

	it('drops the minus of an amount that rounds to nothing', () => {
		expect(formatAmount('-0.4')).toBe('0');
		expect(formatWhole('-0.3')).toBe('0');
	});
});

describe('formatExact', () => {
	it('gives every digit only when formatAmount rounds some away', () => {
		expect(formatExact('1250.5678')).toBe('1,250.5678');
		expect(formatExact('0.123456789 USD')).toBe('0.123456789 USD');
		expect(formatExact('1250.5')).toBe('1,250.5');
		expect(formatExact('1250', '1,250')).toBeUndefined();
	});
});

describe('formatReturn', () => {
	it('gives a gain as a share of its cost', () => {
		expect(formatReturn('250', '1000')).toBe('+25%');
		expect(formatReturn('-74.58', '399972.56')).toBe('0%');
	});

	it('gives nothing without a gain or a positive cost', () => {
		expect(formatReturn(null, '1000')).toBeNull();
		expect(formatReturn('10', '0')).toBeNull();
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

describe('formatIsoDate', () => {
	it("gives the viewer's day as an ISO date", () => {
		expect(formatIsoDate(new Date(2026, 9, 21, 23, 30))).toBe('2026-10-21');
	});
});

describe('formatBucket', () => {
	it('names the day, month or year an ISO day starts', () => {
		expect(formatBucket.day('2026-10-21')).toBe('21 Oct');
		expect(formatBucket.month('2026-10-01')).toBe('Oct 2026');
		expect(formatBucket.year('2026-01-01')).toBe('2026');
	});
});

describe('formatCompact', () => {
	it('shortens large numbers the Indian way', () => {
		expect(formatCompact(1_200_000)).toBe('12L');
	});
});

describe('formatChange', () => {
	it('signs a gain and gives it as a share of the start', () => {
		expect(formatChange('1000', '1250.5')).toEqual({
			amount: '+251',
			percent: '+25.1%',
			negative: false,
		});
	});

	it('marks a loss as negative', () => {
		expect(formatChange('200000', '150000')).toEqual({
			amount: '-50,000',
			percent: '-25%',
			negative: true,
		});
	});

	it('shows no sign when nothing moved', () => {
		expect(formatChange('10', '10')).toEqual({ amount: '0', percent: '0%', negative: false });
	});

	it.each(['0', '-500'])('gives no percent from a start of %s', (start) => {
		expect(formatChange(start, '100').percent).toBeNull();
	});
});

describe('formatColumn', () => {
	it.each([
		[0, 'A'],
		[25, 'Z'],
		[26, 'AA'],
		[701, 'ZZ'],
		[702, 'AAA'],
	])('names column %i %s', (index, name) => {
		expect(formatColumn(index)).toBe(name);
	});
});
