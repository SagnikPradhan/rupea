import { describe, expect, it } from 'vitest';
import { edgeOf, owedOf, seriesOf } from '#lib/web/shared/chart.ts';

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
});
