import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import BarChart from '#lib/web/components/ui-chart-bar/ui-chart-bar.svelte';

/** Every plot measures 100 by 100 pixels, so pointer pixels are plot units. */
Element.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 100, height: 100 });
vi.stubGlobal(
	'ResizeObserver',
	vi.fn(function (notify: (entries: unknown[]) => void) {
		return {
			observe: (target: Element) => {
				const size = [{ inlineSize: 100, blockSize: 100 }];
				const contentRect = { width: 100, height: 100 };
				notify([{ target, contentRect, contentBoxSize: size, borderBoxSize: size }]);
			},
			unobserve: () => undefined,
			disconnect: () => undefined,
		};
	}),
);

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

const drawn = (options: { previous?: (string | null)[]; scale?: 'linear' | 'log' } = {}) => {
	const previous = options.previous;
	render(BarChart, {
		rows: ROWS.map((r, i) => ({ ...r, previous: previous?.[i] ?? null })),
		x: 'bucket',
		bucket: 'month',
		series: previous ? [...PARTS, PREVIOUS] : [...PARTS],
		whole: { ...WHOLE, previous: previous ? '9800' : null },
		label: 'Spending',
		scale: options.scale ?? 'linear',
		summary,
	});
	flushSync();
	const plot = screen.getByRole('img', { name: 'Spending' });
	return { plot, svg: plot.querySelector('svg') as SVGSVGElement };
};

const barsOf = (svg: SVGSVGElement, k: number) =>
	[...svg.querySelectorAll('g')[k]!.querySelectorAll('rect')].map((r) => ({
		x: Number(r.getAttribute('x')),
		y: Number(r.getAttribute('y')),
		width: Number(r.getAttribute('width')),
		height: Number(r.getAttribute('height')),
	}));

const labelsOf = (plot: HTMLElement, axis: 'across' | 'up') =>
	[...plot.querySelectorAll(`span.${axis}`)].map((t) => t.textContent);

const tip = () => screen.getByRole('img').querySelector('[role="tooltip"]')?.textContent;
const key = () => screen.getByRole('figure').querySelector('figcaption')?.textContent;

describe('the bar chart', () => {
	it('stands a bar per bucket, centred in its share of the plot and no wider than 4 percent of it', () => {
		const { svg } = drawn();
		expect(barsOf(svg, 0).map((b) => [b.x.toFixed(2), b.width])).toEqual([
			['14.67', 4],
			['48.00', 4],
			['81.33', 4],
		]);
	});

	it('piles each part on the one before, spending up from zero and refunds down', () => {
		const { svg } = drawn();
		const [food, other] = [barsOf(svg, 0), barsOf(svg, 1)];
		const zero = Number(svg.querySelector('.zero')?.getAttribute('y1'));

		expect(other[0]!.y + other[0]!.height).toBeCloseTo(food[0]!.y);
		expect(food[0]!.y + food[0]!.height).toBeCloseTo(zero);
		expect(food[1]!.y).toBeCloseTo(zero);
		expect(other[1]!.y + other[1]!.height).toBeCloseTo(zero);
		expect(other[2]!.height).toBe(0);
	});

	it('draws zero only when refunds take the plot below it', () => {
		render(BarChart, {
			rows: [ROWS[0]!],
			x: 'bucket',
			bucket: 'month',
			series: [...PARTS],
			whole: WHOLE,
			label: 'Spending',
		});
		expect(document.querySelector('.zero')).toBeNull();
	});

	it('names a bar on the axis by its bucket, skipping the ones a narrow plot has no room for, and its amounts up the side', () => {
		const { plot } = drawn();
		expect(labelsOf(plot, 'across')).toEqual(['Jan 2026', 'Mar 2026']);
		expect(labelsOf(plot, 'up')).toEqual(['0', '5K']);
	});

	it('fits the axis to the bars alone without a reference', () => {
		const { plot } = drawn();
		expect(labelsOf(plot, 'up')).toEqual(['0', '5K']);
		expect(plot.querySelector('path.reference')).toBeNull();
	});

	it('stretches the axis to a reference that runs higher', () => {
		const { plot } = drawn({ previous: ['1000', null, '900000'] });
		expect(labelsOf(plot, 'up').at(-1)).not.toBe('5K');
	});

	it('weighs the bars against a dashed curve, which breaks where a value is missing', () => {
		const { plot } = drawn({ previous: ['1000', null, '9000'] });
		const d = plot.querySelector('path.reference')?.getAttribute('d') ?? '';
		expect(d.match(/M/g)).toHaveLength(2);
	});

	it('names only zero and the powers of ten on a log scale, through zero to the refunds', () => {
		const { plot } = drawn({ scale: 'log' });
		expect(labelsOf(plot, 'up')).toEqual(['-100', '-10', '0', '10', '100', '1K']);
	});

	it('keys each part with the hovered bar’s amount, or the whole’s', async () => {
		const { plot } = drawn();
		expect(key()).toContain('9,500');

		await fireEvent.pointerMove(plot, { clientX: 50, clientY: 0 });
		expect(key()).toContain('-500');
		expect(key()).toContain('300');
	});

	it('keys a part the whole leaves out at zero', () => {
		render(BarChart, {
			rows: ROWS,
			x: 'bucket',
			bucket: 'month',
			series: [...PARTS],
			whole: { bucket: '', food: '9500' },
			label: 'Spending',
		});
		expect(screen.getByText('Other').closest('span')?.querySelector('data')?.textContent).toBe('0');
	});

	it('keys the line beside the parts, with the hovered bar’s value or the whole’s', async () => {
		const { plot } = drawn({ previous: ['1000', null, '9000'] });
		const line = () => screen.getByRole('figure').querySelector('span.reference')?.textContent;
		expect(line()).toContain('Previous 9,800');

		await fireEvent.pointerMove(plot, { clientX: 50, clientY: 0 });
		expect(line()?.trim()).toBe('Previous');
	});

	it('names the part under the pointer in a tip, fading the other parts', async () => {
		const { plot, svg } = drawn();
		const [food, other] = [barsOf(svg, 0)[0]!, barsOf(svg, 1)[0]!];
		const over = (clientX: number, clientY: number) =>
			fireEvent.pointerMove(plot, { clientX, clientY });

		await over(16, food.y + food.height / 2);
		expect(tip()).toContain('Food');
		expect(tip()).toContain('2,000');
		expect(svg.querySelectorAll('g')[1]?.classList.contains('faded')).toBe(true);
		expect(screen.getByText('Other').closest('span')?.classList.contains('faded')).toBe(true);

		await over(16, other.y + other.height / 2);
		expect(tip()).toContain('Other');
		expect(tip()).toContain('500');

		await over(16, other.y - 5);
		expect(tip()).toBeUndefined();

		await over(25, food.y + food.height / 2);
		expect(tip()).toBeUndefined();
	});

	it('fades the other parts while one is focused in the key', async () => {
		const { svg } = drawn();
		const food = screen.getByText('Food');

		await fireEvent.pointerEnter(food);
		expect(svg.querySelectorAll('g')[1]?.classList.contains('faded')).toBe(true);

		await fireEvent.pointerLeave(food);
		expect(svg.querySelector('g.faded')).toBeNull();
	});

	it('hands the summary the bar under the pointer, or none once it leaves', async () => {
		const { plot } = drawn();
		expect(screen.getByTestId('summary').textContent).toBe('null');

		await fireEvent.pointerMove(plot, { clientX: 90, clientY: 0 });
		expect(screen.getByTestId('summary').textContent).toBe('2');

		await fireEvent.pointerLeave(plot);
		expect(screen.getByTestId('summary').textContent).toBe('null');
	});
});
