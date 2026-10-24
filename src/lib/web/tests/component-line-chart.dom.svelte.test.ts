import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import type uPlot from 'uplot';
import { describe, expect, it, vi } from 'vitest';
import LineChart from '#lib/web/components/line-chart/line-chart.svelte';
import { formatPercent } from '#lib/web/shared/format.ts';

type Plot = { options: uPlot.Options; destroyed: boolean; cursor: unknown };

const plots = vi.hoisted(() => [] as Plot[]);

vi.mock('uplot', () => ({
	default: Object.assign(
		vi.fn(function (options: uPlot.Options) {
			const plot: Plot = { options, destroyed: false, cursor: null };
			plots.push(plot);
			return {
				destroy: () => (plot.destroyed = true),
				setSize: () => {},
				setCursor: (c: unknown) => (plot.cursor = c),
				over: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
			};
		}),
		{ tzDate: (d: Date) => d },
	),
}));

// Happy DOM has no font loading; the chart waits on it before drawing.
Object.defineProperty(document, 'fonts', { value: { load: async () => [] } });

const ROWS = [
	{ day: '2026-01-01', worth: '100', assets: '150', liabilities: '50' },
	{ day: '2026-01-02', worth: '-50', assets: '50', liabilities: '100' },
	{ day: '2026-01-03', worth: '300', assets: '400', liabilities: '100' },
];
const SERIES = [
	{ key: 'worth', label: 'Net worth', role: 'primary' },
	{ key: 'assets', label: 'Assets', role: 'context' },
	{ key: 'liabilities', label: 'Owed', role: 'reference' },
] as const;

const summary = createRawSnippet((index: () => number) => ({
	render: () => `<p data-testid="summary">${ROWS[index()]?.worth}</p>`,
	setup: (node) => {
		$effect(() => {
			node.textContent = ROWS[index()]?.worth ?? '';
		});
	},
}));

const drawn = async (unit: 'amount' | 'percent' = 'amount') => {
	plots.splice(0);
	const props = { rows: ROWS, x: 'day', series: [...SERIES], unit, label: 'Net worth', summary };
	const view = render(LineChart, props);
	await vi.waitFor(() => expect(plots).toHaveLength(1));
	const options = plots[0]?.options;
	if (!options) throw new Error('No chart was drawn');
	return { options, view };
};

const hover = (options: uPlot.Options, idx: number | null) => {
	options.hooks?.setCursor?.[0]?.({ cursor: { idx } } as uPlot);
	flushSync();
};

const caption = () => screen.getByRole('figure').querySelector('figcaption')?.textContent;

describe('the line chart', () => {
	it('names itself for screen readers', async () => {
		await drawn();
		expect(screen.getByRole('img', { name: 'Net worth' })).toBeTruthy();
	});

	it('plots each day once, and each series by its role', async () => {
		const { options } = await drawn();
		const series = options.series.slice(1);

		expect(series.map((s) => [s.label, s.width, s.dash])).toEqual([
			['Net worth', 2, []],
			['Assets', 1, []],
			['Owed', 1, [4, 4]],
		]);
	});

	it('captions the other series with their last value, then the one under the cursor', async () => {
		const { options } = await drawn();
		expect(caption()).toContain('400.00');
		expect(caption()).not.toContain('300.00');

		hover(options, 0);
		expect(caption()).toContain('150.00');
		expect(screen.getByTestId('summary').textContent).toBe('100');

		hover(options, null);
		expect(caption()).toContain('400.00');
		expect(screen.getByTestId('summary').textContent).toBe('300');
	});

	it('draws zero only when a line crosses it', async () => {
		const { options } = await drawn();
		const draw = options.hooks?.draw?.[0];
		const ctx = {
			save: vi.fn(),
			restore: vi.fn(),
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
		};
		const plot = (min: number, max: number) =>
			({
				scales: { y: { min, max } },
				ctx,
				bbox: { left: 0, width: 10 },
				valToPos: () => 5,
			}) as unknown as uPlot;

		draw?.(plot(10, 20));
		expect(ctx.stroke).not.toHaveBeenCalled();

		draw?.(plot(-10, 20));
		expect(ctx.stroke).toHaveBeenCalledOnce();
	});

	it('leaves out a date the edge of the plot would cut in half', async () => {
		const { options } = await drawn();
		const values = options.axes?.[0]?.values;
		if (typeof values !== 'function') throw new Error('No date labels');
		const plot = { valToPos: (s: number) => (s === 0 ? 0 : 100) } as unknown as uPlot;

		expect(values(plot, [0, Date.parse('2026-01-02') / 1000], 0, 0, 0)).toEqual(['', '2 Jan']);
	});

	it('ticks and captions a percent chart as percents', async () => {
		const { options } = await drawn('percent');
		const values = options.axes?.[1]?.values;
		if (typeof values !== 'function') throw new Error('No value labels');

		expect(values({} as uPlot, [0.5], 0, 0, 0)).toEqual([formatPercent(0.5)]);
		expect(caption()).toContain(formatPercent(400));
	});

	it('moves the cursor to where a finger touches', async () => {
		await drawn();
		await fireEvent.pointerDown(screen.getByRole('img'), { clientX: 50, clientY: 60 });
		expect(plots[0]?.cursor).toEqual({ left: 40, top: 40 });
	});

	it('lets go of the chart when it leaves the page', async () => {
		const { view } = await drawn();
		view.unmount();
		expect(plots[0]?.destroyed).toBe(true);
	});
});
