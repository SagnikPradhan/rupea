import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';

const LINES = [
	{
		key: 'Liabilities:Loans:Home',
		label: 'Home',
		pins: [
			{ at: '2026-01-01', amount: 30000, past: true, interest: 2500 },
			{ at: '2026-07-01', amount: 15000, past: false, interest: 0 },
		],
	},
	{
		key: 'Liabilities:Loans:Car',
		label: 'Car',
		pins: [{ at: '2026-12-31', amount: 7500, past: false, interest: 0 }],
	},
];

const drawn = (from = '2026-01-01', to = '2026-12-31') => {
	const { container } = render(Timeline, {
		lines: LINES,
		from,
		to,
		today: '2026-06-01',
		bucket: 'month',
		label: 'Payments',
	});
	return container;
};

const pinsOf = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[role=listitem]'));

describe('the timeline chart', () => {
	it('stands a pin for each payment, the ones made drawn solid', () => {
		const pins = pinsOf(drawn());

		expect(pins).toHaveLength(3);
		expect(pins.map((p) => p.classList.contains('past'))).toEqual([true, false, false]);
	});

	it('places a pin in the middle of its month along the axis and sizes it by its amount', () => {
		const [first, second] = pinsOf(drawn());

		expect(parseFloat(first?.style.left ?? '')).toBeCloseTo((15.5 / 365) * 100, 1);
		expect(parseFloat(second?.style.left ?? '')).toBeCloseTo((196.5 / 365) * 100, 1);
		expect(parseFloat(first?.style.getPropertyValue('--spread') ?? '')).toBe(1);
		expect(parseFloat(second?.style.getPropertyValue('--spread') ?? '')).toBeCloseTo(
			Math.sqrt(0.5),
		);
	});

	it('puts each account on a lane of its own', () => {
		const lanes = pinsOf(drawn()).map((p) => p.style.getPropertyValue('--lane'));

		expect(lanes).toEqual(['0', '0', '1']);
	});

	it('says the name, amount and day of a pin on hover', async () => {
		const [pin] = pinsOf(drawn());
		await fireEvent.pointerEnter(pin!);

		expect(screen.getByRole('tooltip').textContent).toMatch(/Home.*30,000.*Jan 2026/);
	});

	it('labels the axis by month', () => {
		const ticks = drawn().querySelectorAll('.ticks time');

		expect(ticks).toHaveLength(12);
		expect(ticks[0]?.textContent).toBe('Jan');
	});

	it('labels the axis by year over a long span', () => {
		const ticks = Array.from(drawn('2023-01-01', '2026-12-31').querySelectorAll('.ticks time'));

		expect(ticks.map((t) => t.textContent)).toEqual(['2023', '2024', '2025', '2026']);
	});

	it('draws an inner circle inside a pin that has interest, and says the interest on hover', async () => {
		const pins = pinsOf(drawn());

		expect(pins.map((p) => p.querySelector('.core') !== null)).toEqual([true, false, false]);

		await fireEvent.pointerEnter(pins[0]!);
		expect(screen.getByRole('tooltip').textContent).toMatch(/about.*2,500.*interest/);
	});
});
