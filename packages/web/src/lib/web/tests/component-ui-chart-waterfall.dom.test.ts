import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Waterfall from '#lib/web/components/ui-chart-waterfall/ui-chart-waterfall.svelte';

const STEPS = [
	{ key: 'start', label: 'Start', kind: 'total' as const, from: 0, to: 1000 },
	{ key: 'income', label: 'Income', kind: 'step' as const, from: 1000, to: 1500 },
	{ key: 'expenses', label: 'Expenses', kind: 'step' as const, from: 1500, to: 1300 },
	{ key: 'end', label: 'End', kind: 'total' as const, from: 0, to: 1300 },
];

describe('the waterfall chart', () => {
	it('draws a bar for each step, green going up, red going down and ink for the totals', () => {
		render(Waterfall, { steps: STEPS, label: 'Net worth' });
		const plot = screen.getByRole('img', { name: 'Net worth' });

		expect(Array.from(plot.querySelectorAll('rect')).map((r) => r.classList[0])).toEqual([
			'total',
			'up',
			'down',
			'total',
		]);
		expect(plot.querySelectorAll('line.link')).toHaveLength(3);
	});

	it('names each bar, and signs the amount each step added', () => {
		render(Waterfall, { steps: STEPS, label: 'Net worth' });

		expect(screen.getByText('Expenses')).toBeTruthy();
		expect(screen.getByText('+500')).toBeTruthy();
		expect(screen.getByText('-200')).toBeTruthy();
		expect(screen.getAllByText('1,000')).toHaveLength(1);
	});

	it('draws the totals from zero, so their heights keep the proportion of what they hold', () => {
		render(Waterfall, { steps: STEPS, label: 'Net worth' });
		const rects = Array.from(
			screen.getByRole('img', { name: 'Net worth' }).querySelectorAll('rect'),
		);
		const [start, , , end] = rects.map((r) => Number(r.getAttribute('height')));

		expect((start ?? 0) / (end ?? 1)).toBeCloseTo(1000 / 1300, 5);
	});
});
