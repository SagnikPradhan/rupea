import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import PageHeader from '#lib/web/components/page-header/page-header.svelte';

const text = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe('the page header', () => {
	it('leads from the ledger down to the page', () => {
		const trail = [
			{ href: '/l/h/transactions', label: 'Personal' },
			{ href: '/l/h/accounts', label: 'Accounts' },
		];
		render(PageHeader, { trail, children: text('<span>INFY</span>') });

		const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
		expect([...crumbs.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
			'Personal',
			'Accounts',
		]);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('INFY');
	});

	it('shows actions only when given', () => {
		const actions = text('<button>Rename</button>');
		render(PageHeader, { trail: [], children: text('<span>a</span>'), actions });
		expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
	});
});
