import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
import { listProblems } from '#lib/endpoints/ledger.remote.ts';
import { listPostings } from '#lib/endpoints/transactions.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/postings/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listAccountTree: vi.fn() }));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
	listProblems: vi.fn(),
}));
vi.mock('#lib/endpoints/transactions.remote.ts', () => ({
	listPostings: vi.fn(),
}));

const answering = (rows: unknown[]) => {
	vi.mocked(listProblems).mockReturnValue(answer([]));
	vi.mocked(listAccountTree).mockReturnValue(answer([{ account: 'Expenses', parent: null }]));
	vi.mocked(listPostings).mockReturnValue(answer({ rows, next: null }));
};

describe('the postings page', () => {
	const food = {
		key: '1:0',
		file: 'bank.rupea',
		line: 5,
		date: '2026-08-29',
		description: 'Groceries',
		account: 'Expenses:Food',
		quantity: '100.00',
	};

	it('lists each posting under its description', async () => {
		visit('/l/h/postings');
		answering([food]);
		render(Page, { data });

		expect(await screen.findByTitle('Groceries')).toBeTruthy();
	});

	it('says when nothing matches the filter', async () => {
		visit('/l/h/postings');
		answering([]);
		render(Page, { data });

		expect(await screen.findByText('No postings match.')).toBeTruthy();
	});
});
