import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import ComingSoon from '#lib/web/components/coming-soon/coming-soon.svelte';
import Panel from '#lib/web/components/panel/panel.svelte';

describe('a panel', () => {
	it('names what it shows above its content', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>rows</p>' }));
		render(Panel, { title: 'Balance sheet', subtitle: 'what you own', children });

		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Balance sheet');
		expect(screen.getByText('what you own')).toBeTruthy();
		expect(screen.getByText('rows')).toBeTruthy();
	});
});

describe('a coming soon panel', () => {
	it('is the placeholder itself, with one muted line', () => {
		render(Panel, {
			title: 'Budgets',
			subtitle: 'what each category was meant to take',
			soon: true,
		});

		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Budgets');
		expect(screen.getByText('Coming soon · what each category was meant to take')).toBeTruthy();
	});
});

describe('a coming soon card', () => {
	it('says the data is not read yet', () => {
		render(ComingSoon);

		expect(screen.getByText('Coming soon')).toBeTruthy();
		expect(screen.getByText('Needs data Rupea does not read yet')).toBeTruthy();
	});

	it('can be titled for what is missing', () => {
		render(ComingSoon, { title: 'Cash cushion' });

		expect(screen.getByText('Cash cushion')).toBeTruthy();
	});
});
