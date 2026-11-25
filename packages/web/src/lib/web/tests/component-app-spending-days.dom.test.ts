import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SpendingDays from '#lib/web/components/app-spending-days/app-spending-days.svelte';

const PROPS = {
	daily: [
		{ day: '2026-01-01', amount: '120' },
		{ day: '2026-01-02', amount: '45' },
	],
	account: 'Expenses',
};

describe('the spending days', () => {
	it('names the account in the subtitle', () => {
		render(SpendingDays, { ...PROPS, account: 'Expenses:Food' });

		expect(screen.getByText('what Food came to on each day')).toBeTruthy();
	});

	it('leaves each day unnamed and names the busiest day until one is hovered', async () => {
		render(SpendingDays, PROPS);

		const chart = screen.getByLabelText('Spending on each day of the period');
		expect(chart.querySelectorAll('td a')[0]?.textContent).toBe('');
		expect(screen.getByText(/Most, on/)).toBeTruthy();

		await fireEvent.pointerEnter(chart.querySelectorAll('td a')[1]?.closest('td') as Element);
		expect(screen.getByText(/On .*2/)).toBeTruthy();
	});
});
