import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SpendingDays from '#lib/web/components/app-spending-days/app-spending-days.svelte';

const PROPS = {
	daily: [
		{ day: 1, amount: '120' },
		{ day: 15, amount: '45' },
	],
	account: 'Expenses',
};

describe('the spending days', () => {
	it('names the account in the subtitle', () => {
		render(SpendingDays, { ...PROPS, account: 'Expenses:Food' });

		expect(screen.getByText('what Food averaged on each day')).toBeTruthy();
	});

	it('draws the average of each day of the month', () => {
		render(SpendingDays, PROPS);

		const chart = screen.getByLabelText(
			'Average spending on each day of the month, over the period',
		);
		expect(chart.textContent).toContain('120');
		expect(chart.textContent).toContain('45');
	});
});
