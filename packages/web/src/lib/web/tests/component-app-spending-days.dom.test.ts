import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SpendingDays from '#lib/web/components/app-spending-days/app-spending-days.svelte';

const PROPS = {
	daily: [
		{ day: '2026-01-01', amount: '120' },
		{ day: '2026-01-02', amount: '45' },
	],
};

describe('the spending days', () => {
	it('asks which days cost the most', () => {
		render(SpendingDays, PROPS);

		expect(screen.getByText('Which days cost the most?')).toBeTruthy();
	});

	it('leaves each day unnamed and names the busiest day until one is hovered', async () => {
		render(SpendingDays, PROPS);

		const chart = screen.getByLabelText('Spending on each day of the period');
		expect(chart.querySelectorAll('td a')[0]?.textContent).toBe('');
		expect(screen.getByText('Most in a day')).toBeTruthy();

		await fireEvent.pointerEnter(chart.querySelectorAll('td a')[1]?.closest('td') as Element);
		expect(screen.getByText('Spent')).toBeTruthy();
		expect(screen.getByText(/2 Jan 2026/)).toBeTruthy();
	});

	it('names the day that cost the most, not a refund', () => {
		render(SpendingDays, {
			daily: [...PROPS.daily, { day: '2026-01-03', amount: '-500' }],
		});

		expect(screen.getByText('1 Jan 2026')).toBeTruthy();
		expect(screen.queryByText('3 Jan 2026')).toBeNull();
	});
});
