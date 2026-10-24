import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listSpending } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/expenses/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listSpending: vi.fn() }));
vi.mock('#lib/endpoints/transactions.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
}));
vi.mock('uplot', () => ({
	default: Object.assign(
		vi.fn(function () {
			return { destroy: () => {}, setSize: () => {} };
		}),
		{ paths: { bars: () => () => null } },
	),
}));

// Happy DOM has no font loading; the chart waits on it before drawing.
Object.defineProperty(document, 'fonts', { value: { load: async () => [] } });

const spending = {
	from: '2026-01-01',
	to: '2026-02-28',
	bucket: 'month',
	buckets: ['2026-01-01', '2026-02-01'],
	totals: [
		{ account: 'Expenses', first: '2026-01-03', amount: '1000', unpriced: 1 },
		{ account: 'Expenses:Food', first: '2026-01-03', amount: '600', unpriced: 1 },
		{ account: 'Expenses:Rent', first: '2026-02-01', amount: '400', unpriced: 0 },
	],
	spent: [
		{ account: 'Expenses', bucket: '2026-01-01', first: '2026-01-03', amount: '600', unpriced: 1 },
		{ account: 'Expenses', bucket: '2026-02-01', first: '2026-02-01', amount: '400', unpriced: 0 },
	],
};
const previous = { ...spending, from: '2025-01-01', buckets: ['2025-01-01'] };

describe('the expenses page', () => {
	it('lists each account with its share, and links to its postings over the days shown', async () => {
		visit('/l/h/expenses');
		vi.mocked(listSpending).mockReturnValue(answer([spending, previous]));
		render(Page, { data });

		const food = await screen.findByTitle('Expenses:Food');
		expect(food.getAttribute('href')).toBe(
			'/l/h/postings?account=Expenses%3AFood&from=2026-01-01&to=2026-02-28',
		);
		expect(screen.getByText('60%')).toBeTruthy();
		expect(screen.getAllByText('1 unpriced')).toHaveLength(2);
	});

	it('says when nothing was spent', async () => {
		visit('/l/h/expenses');
		vi.mocked(listSpending).mockReturnValue(answer([]));
		render(Page, { data });

		expect(await screen.findByText('Nothing spent in this period.')).toBeTruthy();
	});

	it('shows a month as a calendar of days, with no monthly rate', async () => {
		visit('/l/h/expenses?at=2026-01');
		vi.mocked(listSpending).mockReturnValue(answer([{ ...spending, bucket: 'day' }]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Food');
		expect(screen.queryByRole('columnheader', { name: 'Per month' })).toBeNull();
	});
});
