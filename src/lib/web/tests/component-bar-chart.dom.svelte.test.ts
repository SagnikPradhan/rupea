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
		{ paths: { bars: () => () => null, spline: () => () => null } },
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

/** Puts the cursor over a bar, at a pixel in the plot; bars sit as in the drawing test below. */
const hover = ({ options, data }: Plot, idx: number | null, left = -1, top = -1) => {
	const plot = {
		data,
		cursor: { idx, left, top },
		bbox: { left: 0, top: 0, width: 300 },
		valToPos: (v: number, scale: string) => (scale === 'x' ? v * 100 + 50 : 1000 - v / 10),
	};
	options.hooks?.setCursor?.[0]?.(plot as unknown as uPlot);
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

	it('reaches from zero up to the tallest bar, and down for refunds', async () => {
		const { options, data } = await drawn();
		const range = options.scales?.['y']?.range;
		if (typeof range !== 'function') throw new Error('No value range');

		expect(range({ data } as uPlot, 0, 0, 'y')).toEqual([-500, 8000]);
	});

	it('weighs the bars against a curve, which leaves a gap where a value is missing', async () => {
		const { options, data } = await drawn(['1000', null, '9000']);
		const range = options.scales?.['y']?.range;
		if (typeof range !== 'function') throw new Error('No value range');

		expect(data[3]).toEqual([1000, null, 9000]);
		expect(range({ data } as uPlot, 0, 0, 'y')).toEqual([-500, 9000]);
		expect(options.series[3]).toMatchObject({ label: 'Previous', dash: [4, 4] });
		expect(options.series[3]?.paths).toBeTypeOf('function');
	});

	it('piles each part on the one before, spending up from zero and refunds down', async () => {
		const { options, data } = await drawn();
		const rects: number[][] = [];
		const outlines: number[][] = [];
		const ctx = {
			save: vi.fn(),
			restore: vi.fn(),
			setLineDash: vi.fn(),
			lineWidth: 1,
			fillRect: (...r: number[]) => rects.push(r),
			strokeRect: (...r: number[]) => outlines.push(r),
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
			[26, 800, 48, 200],
			[26, 750, 48, 50],
		]);
		expect(rects.slice(2, 4)).toEqual([
			[126, 1000, 48, 50],
			[126, 970, 48, 30],
		]);
		expect(outlines[0]).toEqual([26.5, 800.5, 47, 199]);
		expect(ctx.setLineDash).toHaveBeenCalledWith([]);
	});

	it('names a bar on the axis by its bucket, and nothing between two bars', async () => {
		const { options } = await drawn();
		const values = options.axes?.[0]?.values;
		if (typeof values !== 'function') throw new Error('No bucket labels');
		const plot = { valToPos: () => 100 } as unknown as uPlot;

		expect(values(plot, [0, 0.5, 2], 0, 0, 0)).toEqual(['Jan 2026', '', 'Mar 2026']);
	});

	it('keys each part with the hovered bar’s amount, or the whole’s', async () => {
		const plot = await drawn();
		const key = () => screen.getByRole('figure').querySelector('figcaption')?.textContent;
		expect(key()).toContain('9,500.00');

		hover(plot, 1);
		expect(key()).toContain('-500.00');
		expect(key()).toContain('300.00');
	});

	it('keys the line beside the parts, with the hovered bar’s value or the whole’s', async () => {
		const plot = await drawn(['1000', null, '9000']);
		const line = () => screen.getByRole('figure').querySelector('.reference')?.textContent;
		expect(line()).toContain('Previous 9,800.00');

		hover(plot, 1);
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

	it('names the bar under the cursor in a tip, fading the other parts in the key', async () => {
		const plot = await drawn();
		const tip = () => screen.getByRole('img').querySelector('.tip')?.textContent;
		const other = () => screen.getByText('Other').closest('span');

		hover(plot, 0, 50, 900);
		expect(tip()).toContain('Food');
		expect(tip()).toContain('2,000.00');
		expect(other()?.classList.contains('faded')).toBe(true);

		hover(plot, 0, 50, 775);
		expect(tip()).toContain('Other');
		expect(tip()).toContain('500.00');

		hover(plot, 0, 50, 700);
		expect(tip()).toBeUndefined();

		hover(plot, 0, 95, 900);
		expect(tip()).toBeUndefined();
	});

	it('spaces values by order of magnitude on a log scale, through zero to the refunds', async () => {
		plots.splice(0);
		render(BarChart, {
			rows: ROWS,
			x: 'bucket',
			bucket: 'month',
			series: [...PARTS],
			whole: WHOLE,
			label: 'Spending',
			scale: 'log',
		});

		await vi.waitFor(() => expect(plots).toHaveLength(1));
		expect(plots[0]?.options.scales?.['y']?.distr).toBe(4);

		const values = plots[0]?.options.axes?.[1]?.values;
		if (typeof values !== 'function') throw new Error('No value labels');
		expect(values({} as uPlot, [-10, -1, 0, 1, 5, 10, 20, 1000], 0, 0, 0)).toEqual([
			'-10',
			'',
			'0',
			'',
			'',
			'10',
			'',
			'1K',
		]);
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
		const plot = await drawn();
		expect(screen.getByTestId('summary').textContent).toBe('null');

		hover(plot, 2);
		expect(screen.getByTestId('summary').textContent).toBe('2');

		hover(plot, null);
		expect(screen.getByTestId('summary').textContent).toBe('null');
	});
});
