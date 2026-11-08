import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';

const BUCKETS = ['2026-01-01', '2026-02-01', '2026-03-01'];

const LINES = [
	{
		key: 'Liabilities:Loans:Home',
		label: 'Home',
		circles: [
			{ bucket: '2026-01-01', paid: 34500 },
			{ bucket: '2026-03-01', paid: 34500 },
		],
	},
	{
		key: 'Liabilities:Card',
		label: 'Card',
		circles: [{ bucket: '2026-02-01', paid: 8000 }],
	},
];

const drawn = () => {
	render(Timeline, { lines: LINES, buckets: BUCKETS, bucket: 'month', label: 'Payments' });
	return screen.getByRole('img', { name: 'Payments' });
};

describe('the timeline chart', () => {
	it('names a row for each account and draws a circle for each payment, the larger payment wider', () => {
		const plot = drawn();
		const [home, , card] = Array.from(plot.querySelectorAll<HTMLElement>('.circle'));

		expect(screen.getByText('Home')).toBeTruthy();
		expect(screen.getByText('Card')).toBeTruthy();
		expect(plot.querySelectorAll('.track')).toHaveLength(2);
		expect(plot.querySelectorAll('.circle')).toHaveLength(3);
		expect(parseFloat(home?.style.getPropertyValue('--spread') ?? '0')).toBeGreaterThan(
			parseFloat(card?.style.getPropertyValue('--spread') ?? '0'),
		);
	});

	it('places a circle at its bucket along the dates', () => {
		const plot = drawn();
		const lefts = Array.from(plot.querySelectorAll<HTMLElement>('.circle')).map((c) =>
			parseFloat(c.style.left),
		);

		expect(lefts[0]).toBeLessThan(lefts[2] ?? 0);
		expect(lefts[2]).toBeLessThan(lefts[1] ?? 0);
	});

	it('labels the dates along the bottom', () => {
		const plot = drawn();

		expect(plot.textContent).toMatch(/Jan/);
	});

	it('names the payment under the cursor with its date and amount, fading the others', async () => {
		const plot = drawn();
		const first = plot.querySelectorAll('.circle')[0] as Element;

		await fireEvent.pointerEnter(first);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/Home/);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/Jan/);
		expect(plot.querySelectorAll('.circle.faded')).toHaveLength(2);

		await fireEvent.pointerLeave(first);
		expect(plot.querySelector('[role="tooltip"]')).toBeNull();
	});
});
