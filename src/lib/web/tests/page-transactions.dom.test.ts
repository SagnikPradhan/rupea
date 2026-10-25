import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccountNames, listTransactions, sync } from '#lib/endpoints/transactions.remote.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/transactions/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/transactions.remote.ts', () => ({
	sync: vi.fn(),
	listAccountNames: vi.fn(),
	listTransactions: vi.fn(),
}));

const groceries = {
	id: '1',
	counted: true,
	file: 'bank.rupea',
	line: 4,
	date: '2026-08-29',
	time: '18:45',
	description: 'Groceries',
	postings: [
		{ account: 'Expenses:Food', quantity: '100.00' },
		{ account: 'Assets:Bank', quantity: '-100.00' },
	],
};
const evidence = { ...groceries, id: '2', counted: false, time: null, description: 'Card bill' };

const answering = (rows: unknown[]) => {
	vi.mocked(sync).mockReturnValue(
		answer([], [fault('ParseInvalidPosting', { location: 'a.rupea:2' })]),
	);
	vi.mocked(listAccountNames).mockReturnValue(answer(['Assets:Bank', 'Expenses:Food']));
	vi.mocked(listTransactions).mockReturnValue(answer({ rows, next: null }));
};

describe('the transactions page', () => {
	it('lists each transaction with its postings, and marks evidence', async () => {
		visit('/l/h/transactions');
		answering([groceries, evidence]);
		render(Page, { data });

		expect(await screen.findByRole('rowheader', { name: /Groceries/ })).toBeTruthy();
		expect(screen.getByText('evidence')).toBeTruthy();
		expect(screen.getByText('18:45')).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toContain('This posting can’t be read.');
	});

	it('says when nothing matches the filter', async () => {
		visit('/l/h/transactions?account=Income');
		answering([]);
		render(Page, { data });

		expect(await screen.findByText('No transactions match.')).toBeTruthy();
		expect(listTransactions).toHaveBeenCalledWith(
			expect.objectContaining({ filter: expect.objectContaining({ account: 'Income' }) }),
		);
	});
});
