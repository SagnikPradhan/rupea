import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ListFilter from '#lib/web/components/list-filter/list-filter.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupea.test/l/h/postings?range=all&account=Assets') },
}));

const ACCOUNTS = [
	{ account: 'Assets', parent: null },
	{ account: 'Assets:Bank', parent: 'Assets' },
	{ account: 'Expenses', parent: null },
];
const filter = { period: { kind: 'all' as const }, account: 'Assets', description: '' };
const props = { filter, accounts: ACCOUNTS, today: '2026-10-27', first: '2024-03-05' };

describe('the list filter', () => {
	it('picks a period in place of the one shown, keeping the account', () => {
		render(ListFilter, props);
		expect(screen.getByRole('link', { name: 'Year' }).getAttribute('href')).toBe(
			'?account=Assets&at=2026',
		);
	});

	it('starts a custom period from the ledger’s first day', () => {
		render(ListFilter, props);
		expect(screen.getByRole('link', { name: 'Custom' }).getAttribute('href')).toBe(
			'?account=Assets&from=2024-03-05&to=2026-10-27',
		);
	});

	it('starts a custom period from the days picked', () => {
		const custom = { kind: 'custom' as const, from: '2026-03-01', to: '2026-03-31' };
		render(ListFilter, { ...props, filter: { ...filter, period: custom } });
		expect(screen.getByRole('link', { name: 'Custom' }).getAttribute('href')).toBe(
			'?account=Assets&from=2026-03-01&to=2026-03-31',
		);
	});

	it('offers the accounts the server draws under the one picked', () => {
		render(ListFilter, props);
		expect(screen.getByRole('link', { name: 'Assets:Bank' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Expenses' })).toBeNull();
	});
});
