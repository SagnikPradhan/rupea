import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccounts, listInvested, listReturns } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import { openFilter } from '#tests/shared/filter.ts';
import Page from '#routes/(signed-in)/l/[handle]/accounts/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(),
	listReturns: vi.fn(() => answer([])),
	listInvested: vi.fn(() => answer([])),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
}));
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

describe('the accounts page', () => {
	it('nests accounts under their groups, and links holdings with lots', async () => {
		visit('/l/h/accounts');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		render(Page, { data });

		expect(await screen.findByTitle('Assets:Broker')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'INFY' }).getAttribute('href')).toBe(
			'/l/h/accounts/lots?account=Assets%3ABroker&commodity=INFY',
		);
		expect(screen.getByText('1 unpriced')).toBeTruthy();
	});

	it('reads the period picked from the address, and marks it in the filter', async () => {
		visit('/l/h/accounts?at=2026-09');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		render(Page, { data });
		await openFilter();

		expect(await screen.findByTitle('Assets:Broker')).toBeTruthy();
		expect(vi.mocked(listAccounts)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
		expect(screen.getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page');
	});

	it('narrows the table to the account picked, offering those under it', async () => {
		visit('/l/h/accounts?account=Assets:Broker');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		render(Page, { data });
		await openFilter();

		await screen.findByRole('navigation', { name: 'Account' });
		expect(screen.getByTitle('Assets:Broker')).toBeTruthy();
		expect(screen.queryByTitle('Assets:Bank')).toBeNull();
		expect(screen.getByRole('link', { name: 'Select all' }).getAttribute('href')).toBe('?');
	});

	it('draws the value against the cost, and says so when no holding has a cost', async () => {
		visit('/l/h/accounts?account=Assets:Broker');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
		render(Page, { data });

		expect(await screen.findByText('No investments with a cost in this period.')).toBeTruthy();

		vi.mocked(listInvested).mockReturnValue(
			answer([
				{ day: '2026-01-01', value: '1500', cost: '1500' },
				{ day: '2026-02-01', value: '2000', cost: '1500' },
			]),
		);
		render(Page, { data });

		expect(await screen.findByRole('img', { name: /^Value against cost from/ })).toBeTruthy();
		expect(vi.mocked(listInvested)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Assets:Broker' }),
		);
	});

	it('divides the assets into rings, and says so when something owes', async () => {
		visit('/l/h/accounts');
		vi.mocked(listAccounts).mockReturnValue(
			answer([
				...accounts,
				{
					account: 'Assets:Card',
					parent: 'Assets',
					total: '-300',
					cost: null,
					gain: null,
					unpriced: 0,
					holdings: [rupees('-300')],
				},
			]),
		);
		render(Page, { data });

		expect(
			await screen.findByRole('img', { name: 'How Assets divides across its accounts' }),
		).toBeTruthy();
		expect(screen.getByText('1 account is below zero, so not drawn')).toBeTruthy();
	});

	it('says there is nothing to divide on a ledger with no accounts under Assets', async () => {
		visit('/l/h/accounts');
		vi.mocked(listAccounts).mockReturnValue(answer([]));
		render(Page, { data });

		expect(await screen.findByText('Nothing to divide.')).toBeTruthy();
	});

	it('starts every figure at zero on a ledger with nothing in it yet', async () => {
		visit('/l/h/accounts');
		vi.mocked(listAccounts).mockReturnValue(answer([]));
		render(Page, { data });

		const strip = within(await screen.findByRole('region', { name: 'Figures' }));
		expect(strip.getByText('0% on cost')).toBeTruthy();
		expect(strip.getByText('0%')).toBeTruthy();
		expect(strip.getByText('across 0 accounts')).toBeTruthy();
		expect(screen.getByText(/^0 groups/)).toBeTruthy();
	});

	it('tones a loss as negative, and names a lone account and group in the singular', async () => {
		const lost = { cost: '1500', gain: '-500' };
		visit('/l/h/accounts');
		vi.mocked(listAccounts).mockReturnValue(
			answer([
				{ ...accounts[0]!, ...lost },
				{ ...accounts[2]!, ...lost },
			]),
		);
		render(Page, { data });

		const strip = within(await screen.findByRole('region', { name: 'Figures' }));
		expect(strip.getByText(/on cost$/).classList.contains('negative')).toBe(true);
		expect(strip.getByText('across 1 account')).toBeTruthy();
		expect(screen.getByText(/^1 group ·/)).toBeTruthy();
	});

	it('shows what flowed into each Assets account and its XIRR, per year only over a year', async () => {
		visit('/l/h/accounts?at=2026-09');
		vi.mocked(listAccounts).mockReturnValue(answer(accounts));
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
