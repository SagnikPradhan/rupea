import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccountNames, listPostings, sync } from '#lib/endpoints/transactions.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/postings/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/transactions.remote.ts', () => ({
	sync: vi.fn(),
	listAccountNames: vi.fn(),
	listPostings: vi.fn(),
}));

const answering = (rows: unknown[]) => {
	vi.mocked(sync).mockReturnValue(answer([]));
	vi.mocked(listAccountNames).mockReturnValue(answer(['Expenses:Food']));
	vi.mocked(listPostings).mockReturnValue(answer({ rows, next: null }));
};

describe('the postings page', () => {
	const food = {
		key: '1:0',
		file: 'bank.rupee',
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
