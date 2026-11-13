import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Scatter from '#lib/web/components/ui-chart-scatter/ui-chart-scatter.svelte';

const DOTS = [
	{ key: 'Assets:Gold', label: 'Gold', across: 0.1, up: 0.08, size: 100, part: 0 },
	{ key: 'Assets:Equity', label: 'Equity', across: 0.2, up: -0.02, size: 25, part: 1 },
];

const drawn = () => {
	render(Scatter, {
		dots: DOTS,
		across: 'how much it swings in a year',
		label: 'Return and swing',
	});
	return screen.getByRole('img', { name: 'Return and swing' });
};

describe('the scatter chart', () => {
	it('draws a dot for each account, the larger holding wider, and says what the bottom is', () => {
		const plot = drawn();
		const [gold, equity] = Array.from(plot.querySelectorAll<HTMLElement>('.dot'));

		expect(plot.querySelectorAll('.dot')).toHaveLength(2);
		expect(parseFloat(gold?.style.width ?? '0')).toBeGreaterThan(
			parseFloat(equity?.style.width ?? '0'),
		);
		expect(screen.getByText('how much it swings in a year →')).toBeTruthy();
	});

	it('names the dot under the cursor with its return and swing, fading the others', async () => {
		const plot = drawn();
		const gold = plot.querySelectorAll('.dot')[0] as Element;

		await fireEvent.pointerEnter(gold);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/Gold/);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/8%/);
		expect(plot.querySelectorAll('.dot.faded')).toHaveLength(1);

		await fireEvent.pointerLeave(gold);
		expect(plot.querySelector('[role="tooltip"]')).toBeNull();
	});
});
