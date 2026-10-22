import { render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import type uPlot from 'uplot';
import { describe, expect, it, vi } from 'vitest';
import BarChart from '#lib/web/components/bar-chart/bar-chart.svelte';

type Plot = { options: uPlot.Options; data: uPlot.AlignedData };

const plots = vi.hoisted(() => [] as Plot[]);

vi.mock('uplot', () => ({
	default: Object.assign(
		vi.fn(function (options: uPlot.Options, data: uPlot.AlignedData) {
			plots.push({ options, data });
			return { destroy: () => {}, setSize: () => {} };
		}),
		{ paths: { bars: () => () => null } },
	),
}));

// Happy DOM has no font loading; the chart waits on it before drawing.
Object.defineProperty(document, 'fonts', { value: { load: async () => [] } });

const ROWS = [
	{ bucket: '2026-01-01', spent: '2000' },
	{ bucket: '2026-02-01', spent: '-500' },
	{ bucket: '2026-03-01', spent: '8000' },
];

const summary = createRawSnippet((index: () => number | null) => ({
	render: () => `<p data-testid="summary"></p>`,
	setup: (node) => {
		$effect(() => {
			node.textContent = String(index());
		});
	},
}));

const drawn = async () => {
	plots.splice(0);
	render(BarChart, {
		rows: ROWS,
		x: 'bucket',
		bucket: 'month',
		series: [{ key: 'spent', label: 'Spending', role: 'primary' }],
		label: 'Spending',
		summary,
	});
	await vi.waitFor(() => expect(plots).toHaveLength(1));
	const plot = plots[0];
	if (!plot) throw new Error('No chart was drawn');
	return plot;
};

const hover = (options: uPlot.Options, idx: number | null) => {
	options.hooks?.setCursor?.[0]?.({ cursor: { idx } } as uPlot);
	flushSync();
};

describe('the bar chart', () => {
	it('stands each bar at its index, below zero when it is negative', async () => {
		const { data } = await drawn();
		expect(data).toEqual([
			[0, 1, 2],
			[2000, -500, 8000],
		]);
	});

	it('names a bar on the axis by its bucket, and nothing between two bars', async () => {
		const { options } = await drawn();
		const values = options.axes?.[0]?.values;
		if (typeof values !== 'function') throw new Error('No bucket labels');
		const plot = { valToPos: () => 100 } as unknown as uPlot;

		expect(values(plot, [0, 0.5, 2], 0, 0, 0)).toEqual(['Jan 2026', '', 'Mar 2026']);
	});

	it('hands the summary the bar under the cursor, or none', async () => {
		const { options } = await drawn();
		expect(screen.getByTestId('summary').textContent).toBe('null');

		hover(options, 2);
		expect(screen.getByTestId('summary').textContent).toBe('2');

		hover(options, null);
		expect(screen.getByTestId('summary').textContent).toBe('null');
	});
});
