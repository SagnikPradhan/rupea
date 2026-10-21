import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import type uPlot from 'uplot';
import { describe, expect, it, vi } from 'vitest';
import LineChart from '#lib/web/components/line-chart/line-chart.svelte';

const plots = vi.hoisted(() => [] as { options: uPlot.Options; destroyed: boolean }[]);

vi.mock('uplot', () => ({
	default: Object.assign(
		vi.fn(function (options: uPlot.Options) {
			const plot = { options, destroyed: false };
			plots.push(plot);
			return { destroy: () => (plot.destroyed = true), setSize: () => {} };
		}),
		{ tzDate: (d: Date) => d },
	),
}));

// Happy DOM has no font loading; the chart waits on it before drawing.
Object.defineProperty(document, 'fonts', { value: { load: async () => [] } });

const DAYS = ['2026-01-01', '2026-01-02', '2026-01-03'];
const LINES = [
	{ label: 'Net worth', values: ['100', '-50', '300'], kind: 'ink' as const },
	{ label: 'Assets', values: ['150', '50', '400'], kind: 'faint' as const },
	{ label: 'Owed', values: ['50', '100', '100'], kind: 'dashed' as const },
];

const drawn = async () => {
	const onhover = vi.fn();
	plots.splice(0);
	const view = render(LineChart, { days: DAYS, lines: LINES, label: 'Net worth', onhover });
	await vi.waitFor(() => expect(plots).toHaveLength(1));
	const options = plots[0]?.options;
	if (!options) throw new Error('No chart was drawn');
	return { options, onhover, view };
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

	it('plots each day once, and each line by its kind', async () => {
		const { options } = await drawn();
		const series = options.series.slice(1);

		expect(series.map((s) => [s.label, s.width, s.dash])).toEqual([
			['Net worth', 2, []],
			['Assets', 1, []],
			['Owed', 1, [4, 4]],
		]);
	});

	it('captions the faint lines with their last value, then the one under the cursor', async () => {
		const { options, onhover } = await drawn();
		expect(caption()).toContain('400.00');
		expect(caption()).not.toContain('300.00');

		hover(options, 0);
		expect(caption()).toContain('150.00');
		expect(onhover).toHaveBeenLastCalledWith(0);

		hover(options, null);
		expect(caption()).toContain('400.00');
		expect(onhover).toHaveBeenLastCalledWith(null);
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

	it('lets go of the chart when it leaves the page', async () => {
		const { view } = await drawn();
		view.unmount();
		expect(plots[0]?.destroyed).toBe(true);
	});
});
