import { render, screen, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navigation from '#lib/web/components/navigation/navigation.svelte';

const state = vi.hoisted(() => ({
	page: {
		url: new URL('https://rupea.test/'),
		params: {} as Record<string, string>,
		route: { id: '/(signed-in)' },
	},
}));

vi.mock('$app/state', () => state);
vi.mock('$app/navigation', () => ({ refreshAll: vi.fn() }));
vi.mock('#lib/endpoints/auth.remote.ts', () => ({ signOut: {} }));
vi.mock('#lib/endpoints/theme.remote.ts', async () => ({
	toggleTheme: (await import('#tests/shared/queries.ts')).fakeForm(),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findSync: () => ({
		then: (done: (r: unknown) => unknown) => Promise.resolve({ data: null }).then(done),
		refresh: () => {},
	}),
	resync: Object.assign(vi.fn(), { pending: 0 }),
}));

const at = (path: string, params: Record<string, string> = {}, id = '/(signed-in)/l/[handle]') => {
	state.page.url = new URL(path, 'https://rupea.test');
	state.page.params = params;
	state.page.route = { id };
};

const bar = () => within(screen.getAllByRole('navigation', { name: 'Pages' })[0]!);

beforeEach(() => at('/', {}, '/(signed-in)'));

describe('the navigation', () => {
	it('links Home alone without a ledger, and shows the user', () => {
		render(Navigation, { handle: null, username: 'asha', theme: 'system' });

		expect(
			bar()
				.getAllByRole('link')
				.map((a) => a.textContent),
		).toEqual(['Home']);
		expect(screen.getAllByText('asha').length).toBeGreaterThan(0);
		expect(screen.getAllByRole('button', { name: 'Log out' }).length).toBeGreaterThan(0);
	});

	it('links the ledger pages, and marks Home as the current page on the home page', () => {
		render(Navigation, { handle: 'h', username: 'asha', theme: 'system' });

		expect(
			bar()
				.getAllByRole('link')
				.map((a) => [a.textContent, a.getAttribute('href')]),
		).toEqual([
			['Home', '/'],
			['Accounts', '/l/h/accounts'],
			['Income', '/l/h/income'],
			['Expenses', '/l/h/expenses'],
			['Liabilities', '/l/h/liabilities'],
			['Transactions', '/l/h/transactions'],
			['Files', '/l/h/files'],
		]);
		expect(bar().getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
		expect(bar().getByRole('link', { name: 'Accounts' }).getAttribute('aria-current')).toBeNull();
	});

	it('marks no page current on a page the bar does not list', async () => {
		at('/l/h/postings', { handle: 'h' });
		render(Navigation, { handle: 'h', username: 'asha', theme: 'system' });
		await screen.findAllByRole('button', { name: 'Sync now' });

		expect(
			bar().getByRole('link', { name: 'Transactions' }).getAttribute('aria-current'),
		).toBeNull();
		expect(bar().getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
	});

	it('offers syncing on a ledger page only', async () => {
		at('/l/h/accounts', { handle: 'h' });
		render(Navigation, { handle: 'h', username: 'asha', theme: 'system' });

		expect((await screen.findAllByRole('button', { name: 'Sync now' })).length).toBeGreaterThan(0);
	});

	it('puts the theme toggle and a Close button in the menu', () => {
		render(Navigation, { handle: null, username: 'asha', theme: 'system' });

		const menu = within(document.getElementById('drawer')!);

		expect(menu.getByRole('button', { name: 'Close' })).toBeTruthy();
		expect(menu.getByRole('button', { name: 'Theme: system' })).toBeTruthy();
	});

	it('is the brand alone when signed out', () => {
		render(Navigation, { handle: null, username: null, theme: 'system' });

		expect(screen.getByRole('link', { name: 'Rupea' })).toBeTruthy();
		expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
	});
});
