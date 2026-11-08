import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';

const DUES = [
	{ key: 'Liabilities:Loans:Car', label: 'Car', amount: 12400, due: '2026-11-10' },
	{ key: 'Liabilities:Loans:Home', label: 'Home', amount: 34500, due: '2026-12-05' },
];

const drawn = () => {
	render(Timeline, { dues: DUES, label: 'Payments' });
	return screen.getByRole('list', { name: 'Payments' });
};

describe('the timeline chart', () => {
	it('stands a pin for each payment, in the order given, with its name, amount and day', () => {
		const pins = drawn().querySelectorAll('li');

		expect(pins).toHaveLength(2);
		expect(pins[0]?.textContent).toMatch(/Car/);
		expect(pins[0]?.textContent).toMatch(/12,400/);
		expect(pins[0]?.textContent).toMatch(/10 Nov/);
		expect(pins[1]?.textContent).toMatch(/Home.*34,500.*5 Dec/);
	});

	it('draws the larger payment as the larger circle', () => {
		const [car, home] = Array.from(drawn().querySelectorAll<HTMLElement>('li')).map((l) =>
			parseFloat(l.style.getPropertyValue('--spread')),
		);

		expect(home).toBe(1);
		expect(car).toBeCloseTo(Math.sqrt(12400 / 34500));
	});
});
