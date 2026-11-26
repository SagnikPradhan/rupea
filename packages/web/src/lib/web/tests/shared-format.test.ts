import { describe, expect, it } from 'vitest';
import { formatColumn, formatIsoDate, formatsIn, toneOf } from '#lib/web/shared/format.ts';

const rupees = formatsIn('INR');

describe('formatsIn(INR).amount', () => {
	it('groups digits the Indian way, with no paise', () => {
		expect(rupees.amount('1250000')).toBe('12,50,000');
		expect(rupees.amount('-1250.5')).toBe('-1,251');
	});

	it('rounds rupees to whole ones, and units to four places', () => {
		expect(rupees.amount('1250.5678')).toBe('1,251');
		expect(rupees.amount('0.123456789 USD')).toBe('0.1235 USD');
		expect(rupees.amount('7.123456', true)).toBe('7.1235');
	});

	it('keeps the commodity after the number', () => {
		expect(rupees.amount('10 INFY')).toBe('10 INFY');
	});

	it('drops the minus of an amount that rounds to nothing', () => {
		expect(rupees.amount('-0.4')).toBe('0');
		expect(rupees.whole('-0.3')).toBe('0');
	});
});

describe('formatsIn(INR).exact', () => {
	it('gives every digit only when rupees.amount rounds some away', () => {
		expect(rupees.exact('1250.5678')).toBe('1,250.5678');
		expect(rupees.exact('0.123456789 USD')).toBe('0.123456789 USD');
		expect(rupees.exact('1250.5')).toBe('1,250.5');
		expect(rupees.exact('1250', '1,250')).toBeUndefined();
	});
});

describe('formatsIn(INR).gain', () => {
	it('gives a gain as a share of its cost', () => {
		expect(rupees.gain('250', '1000')).toBe('+25%');
		expect(rupees.gain('-74.58', '399972.56')).toBe('0%');
	});

	it('gives nothing without a gain or a positive cost', () => {
		expect(rupees.gain(null, '1000')).toBeNull();
		expect(rupees.gain('10', '0')).toBeNull();
	});
});

describe('rupees.date', () => {
	it('reads an ISO date as the same day, whatever the time zone', () => {
		expect(rupees.date('2026-01-02')).toBe('2 Jan 2026');
	});
});

describe('rupees.moment', () => {
	it('names the day of a moment', () => {
		expect(rupees.moment(new Date(2026, 7, 29, 12))).toBe('29 Aug 2026');
	});
});

describe('rupees.size', () => {
	it.each([
		[0, '0 B'],
		[999, '999 B'],
		[1200, '1.2 kB'],
		[3_400_000, '3.4 MB'],
		[5_000_000_000, '5,000 MB'],
	])('formats %i bytes as %s', (bytes, text) => {
		expect(rupees.size(bytes)).toBe(text);
	});
});

describe('formatIsoDate', () => {
	it("gives the viewer's day as an ISO date", () => {
		expect(formatIsoDate(new Date(2026, 9, 21, 23, 30))).toBe('2026-10-21');
	});
});

describe('rupees.bucket', () => {
	it('names the day, month or year an ISO day starts', () => {
		expect(rupees.bucket.day('2026-10-21')).toBe('21 Oct');
		expect(rupees.bucket.month('2026-10-01')).toBe('Oct 2026');
		expect(rupees.bucket.year('2026-01-01')).toBe('2026');
	});
});

describe('formatsIn(INR).compact', () => {
	it('shortens large numbers the Indian way', () => {
		expect(rupees.compact(1_200_000)).toBe('12L');
	});
});

describe('formatsIn(INR).change', () => {
	it('signs a gain and gives it as a share of the start', () => {
		expect(rupees.change('1000', '1250.5')).toEqual({
			amount: '+251',
			percent: '+25.1%',
			negative: false,
		});
	});

	it('marks a loss as negative', () => {
		expect(rupees.change('200000', '150000')).toEqual({
			amount: '-50,000',
			percent: '-25%',
			negative: true,
		});
	});

	it('shows no sign when nothing moved', () => {
		expect(rupees.change('10', '10')).toEqual({ amount: '0', percent: '0%', negative: false });
	});

	it.each(['0', '-500'])('gives no percent from a start of %s', (start) => {
		expect(rupees.change(start, '100').percent).toBeNull();
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

describe('toneOf', () => {
	it.each([
		[5, 'positive'],
		[-5, 'negative'],
		[0, undefined],
	])('tones %i as %s', (n, tone) => {
		expect(toneOf(n)).toBe(tone);
	});
});

describe('formatsIn', () => {
	it('groups the way the base currency’s country does', () => {
		expect(formatsIn('INR').whole('1234567')).toBe('12,34,567');
		expect(formatsIn('USD').whole('1234567')).toBe('1,234,567');
		expect(formatsIn('EUR').whole('1234567')).toBe('1,234,567');
	});

	it('writes rupees without a base, and a currency it has no country for as dollars do', () => {
		expect(formatsIn(undefined).whole('1234567')).toBe('12,34,567');
		expect(formatsIn('JPY').whole('1234567')).toBe('1,234,567');
	});
});

describe('formatsIn(USD)', () => {
	const dollars = formatsIn('USD');

	it('writes dates the way the base currency country does', () => {
		expect(dollars.date('2026-01-02')).toBe('Jan 2, 2026');
		expect(dollars.bucket.day('2026-10-21')).toBe('Oct 21');
	});

	it('names every commodity but the base', () => {
		expect(dollars.quantity({ amount: '20.00', commodity: 'USD' })).toBe('20.00');
		expect(dollars.quantity({ amount: '100.00', commodity: 'INR' })).toBe('100.00 INR');
		expect(
			dollars.posted({
				amount: '2.00',
				commodity: 'AAPL',
				price: { amount: '150.00', commodity: 'USD', kind: 'unit' },
				cost: null,
			}),
		).toBe('2.00 AAPL @ 150.00');
	});
});
