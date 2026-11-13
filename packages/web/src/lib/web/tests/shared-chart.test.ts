import { describe, expect, it } from 'vitest';
import {
	coloursOf,
	distinctOf,
	edgeOf,
	PARTS,
	tintOf,
	labelsIn,
	owedOf,
	partAt,
	seriesOf,
	stackOf,
	valuesOf,
} from '#lib/web/shared/chart.ts';

describe('the shades', () => {
	it('run through the chart colours in order, sharing the last past the tenth part', () => {
		expect([0, 1, 8, 9, 10].map(seriesOf)).toEqual([
			'--color-chart-1',
			'--color-chart-2',
			'--color-chart-9',
			'--color-chart-10',
			'--color-chart-10',
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

describe('the colours of accounts', () => {
	it('come from the name alone, whatever its case or the accounts beside it', () => {
		const colours = coloursOf(['Expenses:Food', 'Expenses:Rent']);

		expect(coloursOf(['Expenses:Rent', 'Expenses:Food', 'Expenses:Fuel'])['Expenses:Food']).toBe(
			colours['Expenses:Food'],
		);
		expect(coloursOf(['EXPENSES:food'])['EXPENSES:food']).toBe(colours['Expenses:Food']);
		expect(Object.values(colours).every((c) => c >= 0 && c < PARTS - 1)).toBe(true);
	});
});

describe('the distinct colours of shown accounts', () => {
	it('keep their own colour, and move to the next free one when an account before took it', () => {
		const colours = { A: 2, B: 2, C: 8 };

		expect(distinctOf(['A', 'B', 'C'], colours)).toEqual({ A: 2, B: 3, C: 8 });
		expect(distinctOf(['B', 'A'], colours)).toEqual({ A: 2, B: 3 });
		expect(distinctOf(['B'], colours)).toEqual({ B: 2 });
	});

	it('wrap past the last named colour', () => {
		expect(distinctOf(['A', 'B'], { A: 8, B: 8 })).toEqual({ A: 8, B: 0 });
	});
});

describe('the tints', () => {
	it('lighten level by level from the full colour, then stay at the lightest', () => {
		expect([0, 1, 2, 3, 4].map(tintOf)).toEqual([1, 0.65, 0.45, 0.3, 0.3]);
	});
});

describe('the edges', () => {
	it('sit two steps darker on the same scale', () => {
		expect(edgeOf('--color-ink-2')).toBe('--color-ink-4');
		expect(edgeOf('--color-negative-4')).toBe('--color-negative-6');
	});

	it('are the chart colour itself for a chart colour', () => {
		expect(edgeOf('--color-chart-3')).toBe('--color-chart-3');
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
		const axis = valuesOf({ piles: [], lines: [[-150, null, 2000]], scale: 'log', height: 0 });

		expect(axis.ticks).toEqual([-100, -10, 0, 10, 100, 1000]);
		expect(axis.crossed).toBe(true);
	});

	it('stretches a flat line over one unit, crossing nothing', () => {
		const axis = valuesOf({ piles: [], lines: [[5, 5]], scale: 'linear', height: 0 });

		expect(axis.y.domain()).toEqual([5, 6]);
		expect(axis.crossed).toBe(false);
	});

	it('ticks fewer amounts up a short plot than a tall one', () => {
		const lines = [[0, 1000]];
		const short = valuesOf({ piles: [], lines, scale: 'linear', height: 96 });
		const tall = valuesOf({ piles: [], lines, scale: 'linear', height: 480 });

		expect(short.ticks.length).toBeLessThan(tall.ticks.length);
	});
});

describe('the labels along an axis', () => {
	it('count one per least room, never fewer than two', () => {
		expect(labelsIn(960, 'across')).toBe(10);
		expect(labelsIn(200, 'up')).toBe(4);
		expect(labelsIn(10, 'up')).toBe(2);
	});

	it('assume a desktop-sized plot until the browser has measured it', () => {
		expect(labelsIn(0, 'across')).toBe(5);
		expect(labelsIn(0, 'up')).toBe(2);
	});
});
