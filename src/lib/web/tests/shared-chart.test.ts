import { describe, expect, it } from 'vitest';
import { edgeOf, owedOf, partAt, seriesOf, stackOf, valuesOf } from '#lib/web/shared/chart.ts';

describe('the shades', () => {
	it('step down the ink scale from the darkest, sharing the palest past the last part', () => {
		expect([0, 1, 2, 3, 4, 5].map(seriesOf)).toEqual([
			'--color-ink-6',
			'--color-ink-5',
			'--color-ink-4',
			'--color-ink-3',
			'--color-ink-2',
			'--color-ink-2',
		]);
	});

	it('step down the negative scale for what is owed, sharing the palest past the last part', () => {
		expect([0, 1, 2, 3].map(owedOf)).toEqual([
			'--color-negative-6',
			'--color-negative-5',
			'--color-negative-4',
			'--color-negative-4',
		]);
	});
});

describe('the edges', () => {
	it('sit two steps darker on the same scale', () => {
		expect(edgeOf('--color-ink-2')).toBe('--color-ink-4');
		expect(edgeOf('--color-negative-4')).toBe('--color-negative-6');
	});

	it('take the full colour past the darkest step', () => {
		expect(edgeOf('--color-ink-5')).toBe('--color-ink');
		expect(edgeOf('--color-negative-5')).toBe('--color-negative');
	});

	it('take the full colour of a scale with no steps', () => {
		expect(edgeOf('--color-accent-1')).toBe('--color-accent');
	});
});

describe('the piles', () => {
	const piles = stackOf([{ food: '30', rent: '50' }, { food: '-20' }], ['food', 'rent']);

	it('pile spending up from zero and refunds down, a missing part at zero', () => {
		expect(piles.map((p) => p.map(([from, to]) => [from, to]))).toEqual([
			[
				[0, 30],
				[-20, 0],
			],
			[
				[30, 80],
				[0, 0],
			],
		]);
	});

	it('name the part under a value, and none above, below or past the last row', () => {
		expect(partAt(piles, 0, 40)).toBe(1);
		expect(partAt(piles, 1, -5)).toBe(0);
		expect(partAt(piles, 0, 90)).toBeNull();
		expect(partAt(piles, 2, 10)).toBeNull();
	});
});

describe('the value axis', () => {
	it('ticks the powers of ten on a log scale, through zero to the refunds', () => {
		const axis = valuesOf({ piles: [], lines: [[-150, null, 2000]], scale: 'log' });

		expect(axis.ticks).toEqual([-100, -10, 0, 10, 100, 1000]);
		expect(axis.crossed).toBe(true);
	});

	it('stretches a flat line over one unit, crossing nothing', () => {
		const axis = valuesOf({ piles: [], lines: [[5, 5]], scale: 'linear' });

		expect(axis.y.domain()).toEqual([5, 6]);
		expect(axis.crossed).toBe(false);
	});
});
