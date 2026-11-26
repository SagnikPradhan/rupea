import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/settings/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(() => answer([])),
	listTerms: vi.fn(() => answer([])),
	listBudgets: vi.fn(() => answer([])),
	saveTerms: Object.assign(vi.fn(), { pending: 0 }),
	saveBudget: Object.assign(vi.fn(), { pending: 0 }),
}));

vi.mock('#lib/endpoints/auth.remote.ts', () => ({
	saveUser: vi.fn(),
	sendCode: vi.fn(),
}));

const ledgers = [
	{ handle: 'a', name: 'Personal' },
	{ handle: 'b', name: 'Family' },
];

const open = (shown: { handle: string; name: string }[]) => {
	visit('/settings');
	const user = { username: 'asha', email: 'asha@example.com', local: false };
	render(Page, { data: { user, theme: 'system', ledgers: shown } as never });
};

describe('the settings page', () => {
	it('starts with who you are', async () => {
		open(ledgers);

		expect(((await screen.findByLabelText(/Username/)) as HTMLInputElement).value).toBe('asha');
		expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe('asha@example.com');
		expect(screen.getByRole('link', { name: 'You' }).getAttribute('href')).toBe('#you');
	});

	it('sets up each ledger in a section of its own', async () => {
		open(ledgers);

		expect(await screen.findByText('What each category may spend in Personal')).toBeTruthy();
		expect(screen.getByText('What each category may spend in Family')).toBeTruthy();
	});

	it('lists the sections of each ledger, under its name', async () => {
		open(ledgers);

		const family = within(await screen.findByRole('list', { name: 'Family' }));
		expect(family.getByText('Family')).toBeTruthy();
		expect(family.getByRole('link', { name: 'Budgets' }).getAttribute('href')).toBe('#b-budgets');
	});

	it('leaves out the name of a ledger that is the only one', async () => {
		open(ledgers.slice(0, 1));

		const sections = within(await screen.findByRole('list', { name: 'Personal' }));
		expect(sections.queryByText('Personal')).toBeNull();
		expect(sections.getByRole('link', { name: 'Accounts' }).getAttribute('href')).toBe(
			'#a-accounts',
		);
	});
});
