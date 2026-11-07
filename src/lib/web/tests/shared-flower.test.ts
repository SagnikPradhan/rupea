import { describe, expect, it } from 'vitest';
import { flowerOf } from '#lib/web/shared/flower.ts';

describe('flowerOf', () => {
	it('draws the same flower for the same name', () => {
		expect(flowerOf('sagnik')).toEqual(flowerOf('sagnik'));
	});

	it('draws different flowers for different names', () => {
		const names = ['sagnik', 'asha', 'ravi', 'meera', 'dev', 'zoya'];
		const drawn = new Set(names.map((n) => JSON.stringify(flowerOf(n))));

		expect(drawn.size).toBe(names.length);
	});

	it('keeps petals, colour and core in range', () => {
		for (const name of ['a', 'bb', 'ccc', 'ünï', '']) {
			const flower = flowerOf(name);

			expect(flower.color).toBeGreaterThanOrEqual(1);
			expect(flower.color).toBeLessThanOrEqual(10);
			expect(flower.outer.length).toBeGreaterThanOrEqual(5);
			expect(flower.outer.length).toBeLessThanOrEqual(12);
			expect(flower.inner).toHaveLength(flower.outer.length);
		}
	});
});
