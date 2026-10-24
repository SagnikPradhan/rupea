import { fireEvent, render, screen } from '@testing-library/svelte';
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
	{ bucket: '2026-01-01', food: '2000', other: '500' },
	{ bucket: '2026-02-01', food: '-500', other: '300' },
	{ bucket: '2026-03-01', food: '8000', other: '0' },
];
const WHOLE = { bucket: '', food: '9500', other: '800' };
const PARTS = [
	{ key: 'food', label: 'Food', role: 'part' },
	{ key: 'other', label: 'Other', role: 'part' },
] as const;
const PREVIOUS = { key: 'previous', label: 'Previous', role: 'reference' } as const;

const summary = createRawSnippet((index: () => number | null) => ({
	render: () => `<p data-testid="summary"></p>`,
	setup: (node) => {
		$effect(() => {
			node.textContent = String(index());
		});
	},
}));

const drawn = async (previous?: (string | null)[]) => {
	plots.splice(0);
	render(BarChart, {
		rows: ROWS.map((r, i) => ({ ...r, previous: previous?.[i] ?? null })),
		x: 'bucket',
		bucket: 'month',
		series: previous ? [...PARTS, PREVIOUS] : [...PARTS],
		whole: { ...WHOLE, previous: previous ? '9800' : null },
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
	it('stands each bar at its index, a series per part', async () => {
		const { data } = await drawn();
		expect(data).toEqual([
			[0, 1, 2],
			[2000, -500, 8000],
			[500, 300, 0],
		]);
	});

	it('reaches as far as the parts pile up from zero, and down for refunds', async () => {
		const { options, data } = await drawn();
		const range = options.scales?.['y']?.range;
		if (typeof range !== 'function') throw new Error('No value range');

		expect(range({ data } as uPlot, 0, 0, 'y')).toEqual([-500, 8000]);
	});

	it('weighs the bars against a line, which leaves a gap where a value is missing', async () => {
		const { options, data } = await drawn(['1000', null, '9000']);
		const range = options.scales?.['y']?.range;
		if (typeof range !== 'function') throw new Error('No value range');

		expect(data[3]).toEqual([1000, null, 9000]);
		expect(range({ data } as uPlot, 0, 0, 'y')).toEqual([-500, 9000]);
		expect(options.series[3]).toMatchObject({ label: 'Previous', dash: [4, 4] });
	});

	it('lays each bar’s parts end to end from zero, refunds below it', async () => {
		const { options, data } = await drawn();
		const rects: number[][] = [];
		const ctx = {
			save: vi.fn(),
			restore: vi.fn(),
			fillRect: (...r: number[]) => rects.push(r),
			createPattern: () => null,
		};
		const plot = {
			data,
			ctx,
			bbox: { width: 300 },
			valToPos: (v: number, scale: string) => (scale === 'x' ? v * 100 + 50 : 1000 - v / 10),
		} as unknown as uPlot;

		options.hooks?.draw?.[0]?.(plot);
		expect(rects.slice(0, 2)).toEqual([
			[26, 800, 48, 199],
			[26, 750, 48, 49],
		]);
		expect(rects[2]).toEqual([126, 1000, 48, 49]);
	});

	it('names a bar on the axis by its bucket, and nothing between two bars', async () => {
		const { options } = await drawn();
		const values = options.axes?.[0]?.values;
		if (typeof values !== 'function') throw new Error('No bucket labels');
		const plot = { valToPos: () => 100 } as unknown as uPlot;

		expect(values(plot, [0, 0.5, 2], 0, 0, 0)).toEqual(['Jan 2026', '', 'Mar 2026']);
	});

	it('keys each part with the hovered bar’s amount, or the whole’s', async () => {
		const { options } = await drawn();
		const key = () => screen.getByRole('figure').querySelector('figcaption')?.textContent;
		expect(key()).toContain('9,500.00');

		hover(options, 1);
		expect(key()).toContain('-500.00');
		expect(key()).toContain('300.00');
	});

	it('keys the line beside the parts, with the hovered bar’s value or the whole’s', async () => {
		const { options } = await drawn(['1000', null, '9000']);
		const line = () => screen.getByRole('figure').querySelector('.reference')?.textContent;
		expect(line()).toContain('Previous 9,800.00');

		hover(options, 1);
		expect(line()?.trim()).toBe('Previous');
	});

	it('fades the other parts while one is focused in the key, repainting the same chart', async () => {
		const { options } = await drawn();
		const redraw = vi.fn();
		options.hooks?.ready?.[0]?.({ redraw } as unknown as uPlot);

		const food = screen.getByText('Food');
		await fireEvent.pointerEnter(food);
		expect(redraw).toHaveBeenCalledTimes(1);

		await fireEvent.pointerLeave(food);
		expect(redraw).toHaveBeenCalledTimes(2);
		expect(plots).toHaveLength(1);
	});

	it('draws nothing once removed while its font was loading', async () => {
		plots.splice(0);
		const { unmount } = render(BarChart, {
			rows: ROWS,
			x: 'bucket',
			bucket: 'month',
			series: [...PARTS],
			whole: WHOLE,
			label: 'Spending',
		});
		unmount();

		await new Promise((resolve) => setTimeout(resolve));
		expect(plots).toHaveLength(0);
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
