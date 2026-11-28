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
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	listCurrencies: vi.fn(() => answer(['INR'])),
	saveBase: vi.fn(),
}));
vi.mock('#lib/endpoints/auth.remote.ts', () => ({
	saveUser: vi.fn(),
	sendCode: vi.fn(),
}));

vi.stubGlobal(
	'IntersectionObserver',
	vi.fn(function () {
		return { observe: vi.fn(), disconnect: vi.fn() };
	}),
);

const ledgers = [
	{ handle: 'a', name: 'Personal', base: 'INR' },
	{ handle: 'b', name: 'Family', base: 'USD' },
];

const open = (shown: typeof ledgers) => {
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

	it('sets up each ledger in a section under its name', async () => {
		open(ledgers);

		expect(await screen.findByRole('region', { name: 'Personal' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Family' })).toBeTruthy();
	});

	it('lists the sections of each ledger, under a link to it', async () => {
		open(ledgers);

		const nav = within(await screen.findByRole('navigation', { name: 'Settings sections' }));
		expect(nav.getByRole('link', { name: 'Family' }).getAttribute('href')).toBe('#b');
		const family = within(nav.getByRole('list', { name: 'Family' }));
		expect(family.getByRole('link', { name: 'Currency' }).getAttribute('href')).toBe('#b-currency');
		expect(family.getByRole('link', { name: 'Cards and loans' }).getAttribute('href')).toBe(
			'#b-accounts',
		);
		expect(family.getByRole('link', { name: 'Budgets' }).getAttribute('href')).toBe('#b-budgets');
	});

	it('marks where the page starts as the section in view', async () => {
		open(ledgers);

		const you = await screen.findByRole('link', { name: 'You' });
		expect(you.getAttribute('aria-current')).toBe('location');
		expect(screen.getByRole('link', { name: 'Personal' }).getAttribute('aria-current')).toBeNull();
	});
});
