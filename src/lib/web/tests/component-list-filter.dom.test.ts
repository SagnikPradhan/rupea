import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ListFilter from '#lib/web/components/list-filter/list-filter.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupea.test/l/h/postings?from=2026-03-01&account=Assets') },
}));

const ACCOUNTS = ['Assets:Bank', 'Expenses:Food'];
const filter = { range: 'all' as const, from: '', to: '', account: 'Assets', description: '' };

const spanShown = (from: string, to: string) => {
	render(ListFilter, { filter: { ...filter, from, to }, accounts: ACCOUNTS });
	return screen.getByRole('link', { current: 'page', name: /\d{4}/ });
};

describe('the list filter', () => {
	it('picks a range in place of the days chosen, keeping the account', () => {
		render(ListFilter, { filter: { ...filter, from: '2026-03-01' }, accounts: ACCOUNTS });
		expect(screen.getByRole('link', { name: 'YTD' }).getAttribute('href')).toBe(
			'?account=Assets&range=ytd',
		);
		expect(screen.getByRole('link', { name: '1Y' }).getAttribute('href')).toBe(
			'?account=Assets&range=1y',
		);
	});

	it('names the days from one, linking to the page as it is', () => {
		const days = spanShown('2026-03-01', '');
		expect(days.textContent).toMatch(/^From /);
		expect(days.getAttribute('href')).toBe('?from=2026-03-01&account=Assets');
	});

	it('names the days until one', () => {
		expect(spanShown('', '2026-03-31').textContent).toMatch(/^Until /);
	});

	it('names the days between two', () => {
		expect(spanShown('2026-03-01', '2026-03-31').textContent).toContain('–');
	});

	it('names a single day once', () => {
		expect(spanShown('2026-03-01', '2026-03-01').textContent).not.toContain('–');
	});
});
