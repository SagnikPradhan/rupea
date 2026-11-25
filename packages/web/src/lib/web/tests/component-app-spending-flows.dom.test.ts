import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
import SpendingFlows from '#lib/web/components/app-spending-flows/app-spending-flows.svelte';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

const SPENDING = {
	buckets: [on('2026-01-01')],
	totals: [
		{ account: 'Expenses', parent: null, amount: amount('1000'), unpriced: 0 },
		{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600'), unpriced: 0 },
		{ account: 'Expenses:Rent', parent: 'Expenses', amount: amount('400'), unpriced: 0 },
	],
	deltas: [],
};

const PROPS = {
	spending: SPENDING,
	account: 'Expenses',
	parts: ['Expenses:Food', 'Expenses:Rent'],
	colours: { 'Expenses:Food': 0, 'Expenses:Rent': 1 },
};

describe('the spending flows', () => {
	it('draws the division of the account', () => {
		render(SpendingFlows, PROPS);

		expect(
			screen.getByRole('img', {
				name: 'How Expenses divides into the accounts under it, two levels deep',
			}),
		).toBeTruthy();
	});

	it('says nothing is under an account with no rows under it', () => {
		render(SpendingFlows, { ...PROPS, account: 'Expenses:Food' });

		expect(screen.getByText('Nothing under Food to divide.')).toBeTruthy();
	});
});
