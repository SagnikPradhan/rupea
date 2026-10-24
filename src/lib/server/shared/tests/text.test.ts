import { describe, expect, it } from 'vitest';
import { byCodeUnit, cut } from '#lib/server/shared/text.ts';

describe('cutting text', () => {
	it('splits at the first mark only', () => {
		expect(cut('a=b=c', '=')).toEqual(['a', 'b=c']);
	});

	it('keeps the whole text without the mark', () => {
		expect(cut('abc', '=')).toEqual(['abc', undefined]);
	});
});

describe('ordering by code unit', () => {
	it('sorts as a bare sort does, whatever the locale', () => {
		const words = ['b', 'B', 'é', 'a', 'A', 'e', 'a'];
		expect(words.toSorted(byCodeUnit)).toEqual(words.toSorted());
	});
});
