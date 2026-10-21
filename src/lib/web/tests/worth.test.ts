import { describe, expect, it } from 'vitest';
import { changeOf, rangeOf } from '#lib/web/worth.ts';

describe('rangeOf', () => {
	it.each(['1m', 'ytd', '1y'])('keeps %s', (range) => {
		expect(rangeOf(range)).toBe(range);
	});

	it.each([null, '', '5y'])('falls back to the year so far for %o', (range) => {
		expect(rangeOf(range)).toBe('ytd');
	});
});

describe('changeOf', () => {
	it('signs a gain and gives it as a share of the start', () => {
		expect(changeOf({ worth: '1000' }, { worth: '1250.5' })).toEqual({
			amount: '+250.50',
			percent: '+25.1%',
			negative: false,
		});
	});

	it('marks a loss as negative', () => {
		expect(changeOf({ worth: '200000' }, { worth: '150000' })).toEqual({
			amount: '-50,000.00',
			percent: '-25%',
			negative: true,
		});
	});

	it('shows no sign when nothing moved', () => {
		expect(changeOf({ worth: '10' }, { worth: '10' })).toEqual({
			amount: '0.00',
			percent: '0%',
			negative: false,
		});
	});

	it.each(['0', '-500'])('gives no percent from a start of %s', (start) => {
		expect(changeOf({ worth: start }, { worth: '100' }).percent).toBeNull();
	});
});
