import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
import { listProblems } from '#lib/endpoints/ledger.remote.ts';
import { listTransactions } from '#lib/endpoints/transactions.remote.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/transactions/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listAccountTree: vi.fn() }));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	findTransaction: vi.fn(),
	findTransactionFiles: vi.fn(),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
	listProblems: vi.fn(),
}));
vi.mock('#lib/endpoints/transactions.remote.ts', () => ({
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
	comment: null,
	postings: [
		{ account: 'Expenses:Food', quantity: '100.00' },
		{ account: 'Assets:Bank', quantity: '-100.00' },
	],
};
const evidence = { ...groceries, id: '2', counted: false, time: null, description: 'Card bill' };
const commented = { ...groceries, id: '3', description: 'Rent', comment: 'paid early' };

const answering = (rows: unknown[]) => {
	vi.mocked(listProblems).mockReturnValue(
		answer([], [fault('ParseInvalidPosting', { location: 'a.rupea:2' })]),
	);
	vi.mocked(listAccountTree).mockReturnValue(
		answer([
			{ account: 'Assets', parent: null },
			{ account: 'Expenses', parent: null },
		]),
	);
	vi.mocked(listTransactions).mockReturnValue(answer({ rows, next: null }));
};

describe('the transactions page', () => {
	it('lists each transaction on one row, and marks evidence', async () => {
		visit('/l/h/transactions');
		answering([groceries, evidence]);
		render(Page, { data });

		expect(await screen.findByRole('rowheader', { name: /Groceries/ })).toBeTruthy();
		expect(screen.getByText('evidence')).toBeTruthy();
		expect(screen.getByText('18:45')).toBeTruthy();
		expect(screen.getAllByText('Bank')).toHaveLength(2);
		expect(screen.getAllByText('Food')).toHaveLength(2);
		expect(screen.getByRole('alert').textContent).toContain('This posting can’t be read.');
	});

	it('says how many more accounts a split pays', async () => {
		visit('/l/h/transactions');
		answering([
			{
				...groceries,
				postings: [
					{ account: 'Expenses:Food', quantity: '60.00' },
					{ account: 'Expenses:Gifts', quantity: '40.00' },
					{ account: 'Assets:Bank', quantity: '-100.00' },
				],
			},
		]);
		render(Page, { data });

		expect(await screen.findByText('+1')).toBeTruthy();
	});

	it('links each description to editing it, keeping the filter', async () => {
		visit('/l/h/transactions?account=Expenses');
		answering([groceries]);
		render(Page, { data });

		const link = (await screen.findByRole('link', { name: 'Groceries' })) as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('?account=Expenses&edit=1');
	});

	it('names the applied filters as chips that remove them', async () => {
		visit('/l/h/transactions?account=Expenses&at=2026-08');
		answering([groceries]);
		render(Page, { data });

		const account = (await screen.findByRole('button', { name: 'Expenses' })) as HTMLAnchorElement;
		const month = screen.getByRole('button', { name: 'Aug 2026' }) as HTMLAnchorElement;
		expect(account.getAttribute('href')).toBe('?at=2026-08');
		expect(month.getAttribute('href')).toBe('?account=Expenses');
	});

	it('shows the comment above a transaction as the file writes it', async () => {
		visit('/l/h/transactions');
		answering([commented]);
		render(Page, { data });

		const row = await screen.findByRole('rowheader', { name: /Rent/ });
		expect(row.textContent).toContain('; paid early');
		expect(row.title).toBe('Rent\npaid early');
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
