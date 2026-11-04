import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';

const text = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe('the page header', () => {
	it('titles the page and draws no breadcrumb', () => {
		render(PageHeader, { children: text('<span>INFY</span>') });

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('INFY');
		expect(screen.queryByRole('navigation')).toBeNull();
	});

	it('shows actions only when given', () => {
		const actions = text('<button>Rename</button>');
		render(PageHeader, { children: text('<span>a</span>'), actions });
		expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
	});

	it('shows a subtitle when given', () => {
		render(PageHeader, { subtitle: 'What this page answers', children: text('<span>Home</span>') });
		expect(screen.getByText('What this page answers')).toBeTruthy();
	});
});
