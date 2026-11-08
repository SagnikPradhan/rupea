import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import LineChart from '#lib/web/components/ui-chart-line/ui-chart-line.svelte';

/**
 * Every plot measures 100 by 100 pixels, so a pointer's pixels are the units
 * the plot is drawn in.
 */
Element.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 100, height: 100 });

const ROWS = [
	{ day: '2026-01-01', worth: '100', assets: '150', liabilities: '50' },
	{ day: '2026-01-02', worth: '-50', assets: '50', liabilities: '100' },
	{ day: '2026-01-03', worth: '300', assets: '400', liabilities: '100' },
];
const SERIES = [
	{ key: 'worth', label: 'Net worth', role: 'primary' },
	{ key: 'assets', label: 'Assets', role: 'context' },
	{ key: 'liabilities', label: 'Owed', role: 'negative' },
] as const;

const summary = createRawSnippet((index: () => number) => ({
	render: () => `<p data-testid="summary"></p>`,
	setup: (node) => {
		$effect(() => {
			node.textContent = ROWS[index()]?.worth ?? '';
		});
	},
}));

const drawn = (unit: 'amount' | 'percent' = 'amount') => {
	render(LineChart, {
		rows: ROWS,
		x: 'day',
		series: [...SERIES],
		unit,
		label: 'Net worth',
		summary,
	});
	const plot = screen.getByRole('img', { name: 'Net worth' });
	return { plot, svg: plot.querySelector('svg') as SVGSVGElement };
};

const labelsOf = (plot: HTMLElement, axis: 'across' | 'up') =>
	[...plot.querySelectorAll(`span.${axis}`)].map((t) => t.textContent);

const caption = () => screen.getByRole('figure').querySelector('figcaption')?.textContent;

describe('the line chart', () => {
	it('draws a line per series, styled by its role, with a fill under the primary one', () => {
		const { svg } = drawn();
		const lines = [...svg.querySelectorAll('path.line')];

		expect(lines.map((l) => SERIES.find((s) => l.classList.contains(s.role))?.role)).toEqual([
			'primary',
			'context',
			'negative',
		]);
		expect(svg.querySelector('path.fill')?.getAttribute('fill')).toMatch(/^url\(#.+-fade\)$/);
	});

	it('captions the other series with their last value, then the one under the pointer', async () => {
		const { plot } = drawn();
		expect(caption()).toContain('400');
		expect(screen.getByTestId('summary').textContent).toBe('300');

		await fireEvent.pointerMove(plot, { clientX: 45, clientY: 0 });
		expect(caption()).toContain('50');
		expect(screen.getByTestId('summary').textContent).toBe('-50');

		await fireEvent.pointerLeave(plot);
		expect(screen.getByTestId('summary').textContent).toBe('300');
	});

	it('shades the space between a band line and the primary one', () => {
		render(LineChart, {
			rows: ROWS,
			x: 'day',
			series: [
				{ key: 'assets', label: 'Value', role: 'primary' },
				{ key: 'liabilities', label: 'Cost', role: 'band' },
			],
			label: 'Against cost',
		});

		const svg = screen.getByRole('img', { name: 'Against cost' }).querySelector('svg');
		expect(svg?.querySelectorAll('path.gained')).toHaveLength(1);
		expect(svg?.querySelectorAll('path.lost')).toHaveLength(1);
		expect(svg?.querySelector('path.line.band')).not.toBeNull();
	});

	it('marks the figure as falling when told the measure only counts losses', () => {
		render(LineChart, {
			rows: ROWS,
			x: 'day',
			series: [{ key: 'worth', label: 'Below its high', role: 'primary' }],
			falling: true,
			label: 'Below its high',
		});

		expect(screen.getByRole('figure').classList.contains('falling')).toBe(true);
	});

	it('shades in red only where the primary line falls below the band line', () => {
		render(LineChart, {
			rows: [
				{ day: '2026-01-01', value: '150', cost: '100' },
				{ day: '2026-01-02', value: '150', cost: '100' },
			],
			x: 'day',
			series: [
				{ key: 'value', label: 'Value', role: 'primary' },
				{ key: 'cost', label: 'Cost', role: 'band' },
			],
			label: 'Above cost',
		});

		const svg = screen.getByRole('img', { name: 'Above cost' }).querySelector('svg');
		const height = (selector: string) => svg?.querySelector(selector)?.getAttribute('d') ?? '';
		expect(height('path.gained')).not.toBe(height('path.lost'));
		expect(height('path.lost')).toMatch(/^M[\d.]+,([\d.]+)L[\d.]+,\1/);
	});

	it('fills from the top down to a line that never rises above zero', () => {
		render(LineChart, {
			rows: [
				{ day: '2026-01-01', depth: 0 },
				{ day: '2026-01-02', depth: -0.2 },
			],
			x: 'day',
			unit: 'percent',
			series: [{ key: 'depth', label: 'Below its high', role: 'primary' }],
			label: 'Underwater',
		});

		const fill = screen.getByRole('img', { name: 'Underwater' }).querySelector('path.fill');
		expect(fill?.getAttribute('d')).toMatch(/L100,0L0,0Z$/);
	});

	it('draws zero only when a line crosses it', () => {
		const { svg } = drawn();
		expect(svg.querySelector('.zero')).not.toBeNull();
	});

	it('names dates along the bottom, leaving out one the left edge would cut in half', () => {
		const { plot } = drawn();
		expect(labelsOf(plot, 'across')).toEqual(['2 Jan', '3 Jan']);
	});

	it('names dates by their year when the ticks fall years apart', () => {
		const years = ['2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01'].map((day) => ({
			...ROWS[0]!,
			day,
		}));
		render(LineChart, { rows: years, x: 'day', series: [...SERIES], label: 'Years' });
		expect(labelsOf(screen.getByRole('img', { name: 'Years' }), 'across')).toEqual([
			'2023',
			'2024',
			'2025',
		]);
	});

	it('keeps dates at least 12 percent of the plot apart', () => {
		const months = Array.from({ length: 24 }, (_, i) => ({
			...ROWS[0]!,
			day: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10),
		}));
		render(LineChart, { rows: months, x: 'day', series: [...SERIES], label: 'Months' });
		const plot = screen.getByRole('img', { name: 'Months' });
		const at = [...plot.querySelectorAll<HTMLElement>('span.across')].map((t) =>
			parseFloat(t.style.left),
		);

		expect(at.slice(1).every((x, i) => x - at[i]! >= 12)).toBe(true);
	});

	it('ticks a percent chart as percents', () => {
		const { plot } = drawn('percent');
		expect(labelsOf(plot, 'up').every((l) => l?.endsWith('%'))).toBe(true);
	});

	it('moves the cursor to where a finger touches', async () => {
		const { plot, svg } = drawn();
		await fireEvent.pointerDown(plot, { clientX: 97, clientY: 0 });
		expect(svg.querySelector('.cursor')?.getAttribute('x1')).toBe('100');
	});
});

describe('the line chart with parts', () => {
	const rows = [
		{ day: '2026-01-01', worth: '40', bank: '30', shares: '20', card: '-10' },
		{ day: '2026-01-02', worth: '50', bank: '40', shares: '20', card: '-10' },
	];
	const series = [
		{ key: 'worth', label: 'Net worth', role: 'primary' },
		{ key: 'bank', label: 'Bank', role: 'part', shade: '--color-ink-6' },
		{ key: 'shares', label: 'Shares', role: 'part', shade: '--color-ink-5' },
		{ key: 'card', label: 'Card', role: 'part', shade: '--color-negative-6' },
	] as const;

	const piled = () => {
		render(LineChart, { rows, x: 'day', series: [...series], label: 'Net worth' });
		const plot = screen.getByRole('img', { name: 'Net worth' });
		return { plot, svg: plot.querySelector('svg') as SVGSVGElement };
	};

	it('piles each part in its shade under the lines, without a fill', () => {
		const { svg } = piled();
		const parts = [...svg.querySelectorAll('path.part')];

		expect(parts.map((p) => (p as SVGElement).style.getPropertyValue('--shade'))).toEqual([
			'var(--color-ink-6)',
			'var(--color-ink-5)',
			'var(--color-negative-6)',
		]);
		expect(svg.querySelector('path.fill')).toBeNull();
		expect(svg.querySelector('path.part ~ path.line')).not.toBeNull();
	});

	it('keys each part with its shade', () => {
		piled();
		expect(caption()).toContain('Bank');
		expect(screen.getByText('Card').closest('li')?.querySelector('span')).not.toBeNull();
	});

	it('fades the other parts while one is focused in the key, but not for a line', async () => {
		const { svg } = piled();
		const [worth, bank] = [
			screen.getByText('Net worth').closest('li')!,
			screen.getByText('Bank').closest('li')!,
		];

		await fireEvent.pointerEnter(bank);
		expect(svg.querySelectorAll('path.part.faded')).toHaveLength(2);
		await fireEvent.pointerLeave(bank);
		expect(svg.querySelectorAll('path.part.faded')).toHaveLength(0);

		await fireEvent.pointerEnter(worth);
		expect(svg.querySelectorAll('path.part.faded')).toHaveLength(0);
		await fireEvent.pointerLeave(worth);
		expect(svg.querySelectorAll('path.part.faded')).toHaveLength(0);
	});

	it('draws a lone day, keying a part it has no value for at zero', () => {
		render(LineChart, {
			rows: [{ day: '2026-01-01', worth: '40', bank: '30' }],
			x: 'day',
			series: [...series],
			label: 'Net worth',
		});
		const plot = screen.getByRole('img', { name: 'Net worth' });

		expect(plot.querySelectorAll('path.part')).toHaveLength(3);
		expect(screen.getByText('Shares').closest('li')?.querySelector('data')?.textContent).toBe('0');
	});

	it('names the part under the pointer and fades the others', async () => {
		const { plot, svg } = piled();
		const shares = svg.querySelectorAll('path.part')[1] as SVGPathElement;
		const top = Number(shares.getAttribute('d')?.match(/,([\d.]+)/)?.[1]);

		await fireEvent.pointerMove(plot, { clientX: 99, clientY: top + 1 });
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toContain('Shares');
		expect(svg.querySelectorAll('path.part.faded')).toHaveLength(2);
		expect(screen.getByText('Bank').closest('li')?.classList.contains('faded')).toBe(true);
	});
});
