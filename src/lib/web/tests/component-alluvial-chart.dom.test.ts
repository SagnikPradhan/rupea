import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AlluvialChart from '#lib/web/components/alluvial-chart/alluvial-chart.svelte';

// Happy DOM has no font loading, canvas drawing or paths; the chart waits on the first and paints with the others.
Object.defineProperty(document, 'fonts', { value: { load: async () => [] } });
const texts = vi.hoisted(() => [] as string[]);
const ctx = {
	scale: vi.fn(),
	fill: vi.fn(),
	fillRect: vi.fn(),
	strokeText: vi.fn(),
	fillText: (text: string) => texts.push(text),
};
vi.stubGlobal(
	'Path2D',
	vi.fn(function () {
		return { lineTo: () => {}, closePath: () => {} };
	}),
);
HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 400 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 200 });

const ROWS = [
	{ account: 'Expenses', parent: null, amount: '1000' },
	{ account: 'Expenses:Food', parent: 'Expenses', amount: '600' },
	{ account: 'Expenses:Food:Groceries', parent: 'Expenses:Food', amount: '600' },
	{ account: 'Expenses:Rent', parent: 'Expenses', amount: '400' },
];

const drawn = async () => {
	texts.splice(0);
	render(AlluvialChart, {
		rows: ROWS,
		account: 'Expenses',
		parts: ['Expenses:Food', 'Expenses:Rent'],
		label: 'Flows',
	});
	await vi.waitFor(() => expect(texts).toContain('Groceries'));
	return screen.getByRole('img', { name: 'Flows' });
};

describe('the alluvial chart', () => {
	it('names the bars past the first, beside them', async () => {
		await drawn();
		expect(texts).toEqual(['Food', 'Rent', 'Groceries']);
	});

	it('names the bar under the cursor in a tip, until it leaves', async () => {
		const plot = await drawn();
		await fireEvent.pointerMove(plot, { offsetX: 150, offsetY: 60 });
		expect(plot.querySelector('.tip')?.textContent).toContain('Food');
		expect(plot.querySelector('.tip')?.textContent).toContain('600.00');

		await fireEvent.pointerLeave(plot);
		expect(plot.querySelector('.tip')).toBeNull();
	});
});
