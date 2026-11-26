import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
import SpendingBreakdown from '#lib/web/components/app-spending-breakdown/app-spending-breakdown.svelte';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

const PROPS = {
	spending: {
		buckets: [on('2026-01-01')],
		totals: [
			{ account: 'Expenses', parent: null, amount: amount('1000'), unpriced: 0 },
			{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600'), unpriced: 0 },
			{ account: 'Expenses:Rent', parent: 'Expenses', amount: amount('400'), unpriced: 0 },
		],
		deltas: [],
	},
	account: 'Expenses',
	parts: ['Expenses:Food', 'Expenses:Rent'],
	colours: { 'Expenses:Food': 0, 'Expenses:Rent': 1 },
	bucket: 'month' as const,
	first: on('2026-01-01'),
	last: on('2026-01-31'),
	handle: 'h',
	period: { kind: 'all' as const },
};

describe('the spending breakdown', () => {
	it('asks which accounts took the most', () => {
		render(SpendingBreakdown, PROPS);

		expect(screen.getByText('Which accounts took the most?')).toBeTruthy();
	});

	it('draws the flow beside the table under one heading', () => {
		render(SpendingBreakdown, PROPS);

		expect(screen.getAllByRole('heading', { name: 'Where the money went' })).toHaveLength(1);
		expect(screen.getByRole('img', { name: /divides into/ })).toBeTruthy();
		expect(screen.getByText('Per month')).toBeTruthy();
	});
});
