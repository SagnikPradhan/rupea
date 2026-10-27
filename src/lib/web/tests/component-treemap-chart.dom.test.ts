import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import TreemapChart from '#lib/web/components/treemap-chart/treemap-chart.svelte';

Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 400 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 200 });

const ROWS = [
	{ account: 'Assets', parent: null, total: '1000', holdings: [] },
	{
		account: 'Assets:Bank',
		parent: 'Assets',
		total: '600',
		holdings: [{ commodity: 'INR', value: '600' }],
	},
	{
		account: 'Assets:Cash',
		parent: 'Assets',
		total: '400',
		holdings: [{ commodity: 'INR', value: '400' }],
	},
];

describe('the treemap chart', () => {
	it('boxes each account under the one picked, and tips the one under the cursor', async () => {
		render(TreemapChart, { rows: ROWS, account: 'Assets', label: 'Holdings' });
		const plot = screen.getByRole('img', { name: 'Holdings' });
		const boxes = await vi.waitFor(() => {
			const found = [...plot.querySelectorAll('.box')];
			expect(found).toHaveLength(2);
			return found;
		});

		await fireEvent.pointerEnter(boxes[1] as Element);
		expect(plot.querySelector('.tip')?.textContent).toMatch(/Cash\s*400.00\s*40%/);
		await fireEvent.pointerLeave(boxes[1] as Element);
		expect(plot.querySelector('.tip')).toBeNull();
	});
});
