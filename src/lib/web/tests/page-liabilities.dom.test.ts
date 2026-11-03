import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import Page from '#routes/(signed-in)/l/[handle]/liabilities/+page.svelte';

it('titles the page, says what it answers and shows a coming soon block', () => {
	render(Page);

	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Liabilities');
	expect(screen.getByText('What you owe, and how fast it is going down')).toBeTruthy();
	expect(screen.getByText('Coming soon')).toBeTruthy();
});
