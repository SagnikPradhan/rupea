import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';

const LINES = [
	{
		key: 'Liabilities:Loans:Home',
		label: 'Home',
		pins: [
			{ at: '2026-01-01', amount: 30000, past: true },
			{ at: '2026-07-01', amount: 15000, past: false },
		],
	},
	{
		key: 'Liabilities:Loans:Car',
		label: 'Car',
		pins: [{ at: '2026-12-31', amount: 7500, past: false }],
	},
];

const drawn = (from = '2026-01-01', to = '2026-12-31') => {
	render(Timeline, { lines: LINES, from, to, today: '2026-06-01', label: 'Payments' });
	return screen.getByRole('list', { name: 'Payments' });
};

describe('the timeline chart', () => {
	it('gives each account a line, with a pin for each payment, past ones filled', () => {
		const [home, car] = drawn().querySelectorAll('[role=listitem]');

		expect(home?.textContent).toMatch(/Home/);
		expect(home?.querySelectorAll('data')).toHaveLength(2);
		expect(home?.querySelectorAll('data.past')).toHaveLength(1);
		expect(car?.querySelectorAll('data.past')).toHaveLength(0);
	});

	it('places a pin by its day along the axis and sizes it by its amount', () => {
		const [first, second] = Array.from(drawn().querySelectorAll<HTMLElement>('data'));

		expect(first?.style.left).toBe('0%');
		expect(parseFloat(second?.style.left ?? '')).toBeCloseTo((181 / 364) * 100, 0);
		expect(parseFloat(first?.style.getPropertyValue('--spread') ?? '')).toBe(1);
		expect(parseFloat(second?.style.getPropertyValue('--spread') ?? '')).toBeCloseTo(
			Math.sqrt(0.5),
		);
	});

	it('labels the axis by month, and by year when it spans years', () => {
		const monthly = drawn();
		expect(monthly.querySelectorAll('time')).toHaveLength(12);
		expect(monthly.querySelector('time')?.textContent).toBe('Jan');
	});

	it('labels the axis by year over a long span', () => {
		const long = drawn('2023-01-01', '2026-12-31');

		expect(Array.from(long.querySelectorAll('time')).map((t) => t.textContent)).toEqual([
			'2023',
			'2024',
			'2025',
			'2026',
		]);
	});
});
