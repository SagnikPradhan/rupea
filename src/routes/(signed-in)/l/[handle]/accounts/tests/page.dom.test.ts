import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccounts, listWorth } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '../+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(),
	listWorth: vi.fn(),
}));
vi.mock('uplot', () => ({
	default: vi.fn(function () {
		return { destroy: () => {}, setSize: () => {} };
	}),
}));

// Happy DOM has no font loading; the chart waits on it before drawing.
Object.defineProperty(document, 'fonts', { value: { load: async () => [] } });

const rupees = (total: string) => ({
	commodity: 'INR',
	hasLots: false,
	units: null,
	cost: null,
	price: null,
	value: total,
	gain: null,
});

const accounts = [
	{
		account: 'Assets',
		total: '51500',
		cost: '1500',
		gain: '500',
		unpriced: 1,
		holdings: [rupees('50000')],
	},
	{
		account: 'Assets:Bank',
		total: '50000',
		cost: null,
		gain: null,
		unpriced: 0,
		holdings: [rupees('50000')],
	},
	{
		account: 'Assets:Broker',
		total: '2000',
		cost: '1500',
		gain: '500',
		unpriced: 0,
		holdings: [
			rupees('0'),
			{
				commodity: 'INFY',
				hasLots: true,
				units: '1 INFY',
				cost: '1500',
				price: '2000',
				value: '2000',
				gain: '500',
			},
		],
	},
];

const worth = [
	{ day: '2026-01-01', assets: '1000', liabilities: '0', worth: '1000', unpriced: 0 },
	{ day: '2026-09-01', assets: '51500', liabilities: '0', worth: '51500', unpriced: 0 },
];

describe('the accounts page', () => {
	it('nests accounts under their groups, and links holdings with lots', async () => {
		visit('/l/h/accounts');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		vi.mocked(listWorth).mockReturnValue(answer(worth));
		render(Page, { data });

		expect(await screen.findByTitle('Assets:Broker')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'INFY' }).getAttribute('href')).toBe(
			'/l/h/accounts/lots?account=Assets%3ABroker&commodity=INFY',
		);
		expect(screen.getByText('1 unpriced')).toBeTruthy();
	});
});
