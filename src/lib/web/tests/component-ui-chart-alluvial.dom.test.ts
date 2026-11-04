import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AlluvialChart from '#lib/web/components/ui-chart-alluvial/ui-chart-alluvial.svelte';

const flow = (
	key: string,
	amount: number,
	column: number,
	part: number | null,
	from: string | null,
) => ({
	key,
	label: key,
	amount,
	column,
	part,
	from,
});

const FLOWS = [
	flow('Expenses', 1000, 0, null, null),
	flow('Food', 600, 1, 0, 'Expenses'),
	flow('Rent', 400, 1, 1, 'Expenses'),
	flow('Groceries', 600, 2, 0, 'Food'),
];

const drawn = () => {
	render(AlluvialChart, { flows: FLOWS, label: 'Flows' });
	return screen.getByRole('img', { name: 'Flows' });
};

const barsIn = (plot: HTMLElement) =>
	[...plot.querySelectorAll('rect')].map((r) => ({
		x: Number(r.getAttribute('x')),
		y: Number(r.getAttribute('y')),
		height: Number(r.getAttribute('height')),
	}));

describe('the alluvial chart', () => {
	it('stands each column of bars at one scale, the first and last at the edges', () => {
		const [expenses, food, rent, groceries] = barsIn(drawn());

		expect([expenses, food, rent, groceries].map((b) => b?.x)).toEqual([0, 49.5, 49.5, 99]);
		expect(food!.height / rent!.height).toBeCloseTo(1.5);
		expect(groceries!.height).toBeCloseTo(food!.height);
	});

	it('runs a band into every bar but the first', () => {
		expect(drawn().querySelectorAll('path.band')).toHaveLength(3);
	});

	it('names the bars past the first, beside them', () => {
		const names = [...drawn().querySelectorAll('.name')].map((t) => t.textContent);
		expect(names).toEqual(['Food', 'Rent', 'Groceries']);
	});

	it('names the bar under the cursor in a tip, fading the other parts, until it leaves', async () => {
		const plot = drawn();
		const food = plot.querySelectorAll('rect')[1] as Element;

		await fireEvent.pointerEnter(food);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/Food\s*600/);
		expect(plot.querySelectorAll('.faded')).toHaveLength(2);

		await fireEvent.pointerLeave(food);
		expect(plot.querySelector('[role="tooltip"]')).toBeNull();
	});

	it('names the bar a band runs into when the cursor is on the band', async () => {
		const plot = drawn();
		await fireEvent.pointerEnter(plot.querySelectorAll('path.band')[2] as Element);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toContain('Groceries');
	});
});
