import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccounts, listReturns, listWorth } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/accounts/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(),
	listReturns: vi.fn(() => answer([])),
	listWorth: vi.fn(),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
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
		parent: null,
		total: '51500',
		cost: '1500',
		gain: '500',
		unpriced: 1,
		holdings: [rupees('50000')],
	},
	{
		account: 'Assets:Bank',
		parent: 'Assets',
		total: '50000',
		cost: null,
		gain: null,
		unpriced: 0,
		holdings: [rupees('50000')],
	},
	{
		account: 'Assets:Broker',
		parent: 'Assets',
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
	{
		day: '2026-01-01',
		assets: '1000',
		liabilities: '0',
		worth: '1000',
		parts: [{ account: 'Assets:Bank', commodity: null, amount: '1000' }],
		unpriced: 0,
	},
	{
		day: '2026-09-01',
		assets: '51500',
		liabilities: '-1500',
		worth: '50000',
		parts: [
			{ account: 'Assets:Bank', commodity: null, amount: '50000' },
			{ account: 'Assets:Broker', commodity: null, amount: '1500' },
			{ account: 'Liabilities:Card', commodity: null, amount: '-1500' },
		],
		unpriced: 0,
	},
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

	it('shows the period picked beside the graph, each part and owing below zero as the accounts hold it', async () => {
		visit('/l/h/accounts?at=2026-09');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		vi.mocked(listWorth).mockReturnValue(answer(worth));
		render(Page, { data });

		expect(await screen.findByText(/^Owed/)).toBeTruthy();
		const key = within(screen.getByRole('figure'));
		expect(key.getByText(/^Broker/).textContent).toContain('1,500.00');
		expect(key.getByText(/^Card/).textContent).toContain('-1,500.00');
		expect(screen.getByText(/^Owed/).textContent).toContain('-1,500.00');
		expect(vi.mocked(listWorth)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
		expect(screen.getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page');
	});

	it('narrows the graph and the table to the account picked, offering those under it', async () => {
		visit('/l/h/accounts?account=Assets:Broker');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		vi.mocked(listWorth).mockReturnValue(answer(worth));
		render(Page, { data });

		const picker = within(await screen.findByRole('navigation', { name: 'Account' }));
		expect(vi.mocked(listWorth)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Assets:Broker' }),
		);
		expect(screen.getByTitle('Assets:Broker')).toBeTruthy();
		expect(screen.queryByTitle('Assets:Bank')).toBeNull();
		expect(picker.getByRole('link', { name: 'All' }).getAttribute('href')).toBe('?');
	});

	it('switches the graph for boxes of what each account holds at the end of the period', async () => {
		visit('/l/h/accounts?chart=treemap&at=2026');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		vi.mocked(listWorth).mockReturnValue(answer(worth));
		render(Page, { data });

		const chart = within(await screen.findByRole('navigation', { name: 'Chart' }));
		expect(
			screen.getByRole('img', { name: 'What Assets held on 1 Sept 2026, by account' }),
		).toBeTruthy();
		expect(vi.mocked(listAccounts)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'year', at: '2026' } }),
		);
		expect(chart.getByRole('link', { name: 'Over time' }).getAttribute('href')).toContain(
			'chart=time',
		);
	});

	it('shows what flowed into each Assets account and its XIRR, per year only over a year', async () => {
		visit('/l/h/accounts?at=2026-09');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		vi.mocked(listWorth).mockReturnValue(answer(worth));
		vi.mocked(listReturns).mockReturnValue(
			answer(
				[
					{ account: 'Assets', netIn: '1500', xirr: null, yearly: false },
					{ account: 'Assets:Bank', netIn: '-1500', xirr: 0.035, yearly: true },
					{ account: 'Assets:Broker', netIn: '1500', xirr: -0.02, yearly: false },
				],
				[{ type: 'ReturnUnsolved', account: 'Assets' }],
			),
		);
		render(Page, { data });

		const bank = (await screen.findByTitle('Assets:Bank')).closest('tr');
		const broker = screen.getByTitle('Assets:Broker').closest('tr');
		expect(bank?.textContent).toContain('3.5%');
		expect(within(bank as HTMLElement).getByTitle('XIRR, per year').textContent).toContain('p.a.');
		expect(within(broker as HTMLElement).getByTitle('Return over the period').textContent).toBe(
			'-2%',
		);
		expect(screen.getByText(/Assets has no XIRR/)).toBeTruthy();
		expect(vi.mocked(listReturns)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
	});
});
