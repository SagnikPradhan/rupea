import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
import SpendingAccounts from '#lib/web/components/app-spending-accounts/app-spending-accounts.svelte';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

const SPENDING = {
	buckets: [on('2026-01-01')],
	totals: [
		{ account: 'Expenses', parent: null, amount: amount('1000'), unpriced: 0 },
		{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600'), unpriced: 0 },
		{ account: 'Expenses:Food:Cafe', parent: 'Expenses:Food', amount: amount('200'), unpriced: 0 },
		{ account: 'Expenses:Rent', parent: 'Expenses', amount: amount('400'), unpriced: 0 },
	],
	deltas: [],
};

const PROPS = {
	spending: SPENDING,
	account: 'Expenses',
	parts: ['Expenses:Food'],
	colours: { 'Expenses:Food': 0 },
	bucket: 'month' as const,
	first: on('2026-01-01'),
	last: on('2026-01-31'),
	handle: 'h',
	period: { kind: 'all' as const },
};

describe('the spending by account', () => {
	it('shows the share of the whole and the monthly average of a row', () => {
		render(SpendingAccounts, PROPS);

		expect(screen.getByText('60%')).toBeTruthy();
		expect(screen.getByText('Per month')).toBeTruthy();
	});

	it('hides the per month column for a day bucket', () => {
		render(SpendingAccounts, { ...PROPS, bucket: 'day' });

		expect(screen.queryByText('Per month')).toBeNull();
	});

	it('folds and unfolds the accounts under a group', async () => {
		render(SpendingAccounts, PROPS);

		expect(screen.queryByTitle('Expenses:Food:Cafe')).toBeNull();

		await fireEvent.click(screen.getByLabelText('Accounts under Food'));
		expect(screen.getByTitle('Expenses:Food:Cafe')).toBeTruthy();

		await fireEvent.click(screen.getByLabelText('Accounts under Food'));
		expect(screen.queryByTitle('Expenses:Food:Cafe')).toBeNull();
	});

	it('draws a swatch on a row under a part only', () => {
		render(SpendingAccounts, PROPS);

		const swatches = (title: string) =>
			screen.getByTitle(title).closest('th')?.querySelectorAll('span[aria-hidden="true"][style]')
				.length;

		expect(swatches('Expenses:Food')).toBe(1);
		expect(swatches('Expenses:Rent')).toBe(0);
	});

	it('says nothing was spent without rows', () => {
		render(SpendingAccounts, { ...PROPS, spending: undefined });

		expect(screen.getByText('Nothing spent in this period.')).toBeTruthy();
	});
});
