import { describe, expect, it } from 'vitest';
import {
	formatAmount,
	formatChange,
	formatColumn,
	formatCompact,
	formatDate,
	formatExact,
	formatIsoDate,
	formatMoment,
	formatReturn,
	formatShort,
	formatShortDate,
	formatSize,
} from '#lib/web/shared/format.ts';

describe('formatAmount', () => {
	it('groups digits the Indian way, keeping two decimals at least', () => {
		expect(formatAmount('1250000')).toBe('12,50,000.00');
		expect(formatAmount('-1250.5')).toBe('-1,250.50');
	});

	it('rounds rupees to two places, and units to four', () => {
		expect(formatAmount('1250.5678')).toBe('1,250.57');
		expect(formatAmount('0.123456789 USD')).toBe('0.1235 USD');
		expect(formatAmount('7.123456', true)).toBe('7.1235');
	});

	it('keeps the commodity after the number', () => {
		expect(formatAmount('10 INFY')).toBe('10.00 INFY');
	});
});

describe('formatShort', () => {
	it('keeps three digits in lakhs, crores and thousands', () => {
		expect(formatShort('7639574.02')).toBe('76.4L');
		expect(formatShort('126392130')).toBe('12.6Cr');
		expect(formatShort('-149.54')).toBe('-150');
	});

	it('keeps the commodity after the number', () => {
		expect(formatShort('18692.062 AABR')).toBe('18.7K AABR');
	});
});

describe('formatExact', () => {
	it('gives every digit only when formatAmount rounds some away', () => {
		expect(formatExact('1250.5678')).toBe('1,250.5678');
		expect(formatExact('0.123456789 USD')).toBe('0.123456789 USD');
		expect(formatExact('1250.5')).toBeUndefined();
		expect(formatExact('7639574.02', '76.4L')).toBe('76,39,574.02');
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

describe('formatShortDate', () => {
	it('names the UTC day and month, without the year', () => {
		expect(formatShortDate(new Date('2026-10-21'))).toBe('21 Oct');
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
			amount: '+250.50',
			percent: '+25.1%',
			negative: false,
		});
	});

	it('marks a loss as negative', () => {
		expect(formatChange('200000', '150000')).toEqual({
			amount: '-50,000.00',
			percent: '-25%',
			negative: true,
		});
	});

	it('shows no sign when nothing moved', () => {
		expect(formatChange('10', '10')).toEqual({ amount: '0.00', percent: '0%', negative: false });
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
