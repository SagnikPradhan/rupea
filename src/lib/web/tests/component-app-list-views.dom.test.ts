import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ListViews from '#lib/web/components/app-list-views/app-list-views.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupea.test/l/h/transactions?account=Assets') },
}));

const search = createRawSnippet(() => ({ render: () => '<form>Search</form>' }));

describe('the list views', () => {
	it('link the two lists, keeping the query, and mark the one shown', () => {
		render(ListViews, { handle: 'h', chosen: 'transactions', children: search });

		const shown = screen.getByRole('link', { name: 'Transactions' });
		expect(shown.getAttribute('aria-current')).toBe('page');
		expect(shown.getAttribute('href')).toBe('/l/h/transactions?account=Assets');
		expect(screen.getByRole('link', { name: 'Postings' }).getAttribute('href')).toBe(
			'/l/h/postings?account=Assets',
		);
	});

	it('mark the postings when they are shown, with the search beside', () => {
		render(ListViews, { handle: 'h', chosen: 'postings', children: search });

		expect(screen.getByRole('link', { name: 'Postings' }).getAttribute('aria-current')).toBe(
			'page',
		);
		expect(screen.getByText('Search')).toBeTruthy();
	});
});
