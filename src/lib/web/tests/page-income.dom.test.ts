import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import Page from '#routes/(signed-in)/l/[handle]/income/+page.svelte';

it('titles the page, says what it answers and shows a coming soon block', () => {
	render(Page);

	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Income');
	expect(screen.getByText('Where the money came from, month by month')).toBeTruthy();
	expect(screen.getByText('Coming soon')).toBeTruthy();
});
