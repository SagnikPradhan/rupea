import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { type Amount, parseAmount } from '#lib/shared/amounts.ts';
import AccountsTable from '#lib/web/components/app-accounts-table/app-accounts-table.svelte';

const amount = (text: string) => parseAmount(text) as Amount;

const rupees = (value: string) => ({
	commodity: 'INR',
	hasLots: false,
	units: null,
	cost: null,
	price: null,
	value,
	gain: null,
});

const infosys = {
	commodity: 'INFY',
	hasLots: true,
	units: '1 INFY',
	cost: '1500',
	price: '2000',
	value: '2000',
	gain: '500',
};

const bank = {
	account: 'Assets:Bank',
	parent: 'Assets',
	total: amount('50000'),
	cost: null,
	gain: null,
	unpriced: 0,
	holdings: [rupees('50000')],
};

const broker = {
	account: 'Assets:Broker',
	parent: 'Assets',
	total: amount('2000'),
	cost: amount('1500'),
	gain: amount('500'),
	unpriced: 0,
	holdings: [rupees('0'), infosys],
};

const assets = {
	account: 'Assets',
	parent: null,
	total: amount('52000'),
	cost: amount('1500'),
	gain: amount('500'),
	unpriced: 0,
	holdings: [rupees('50000')],
};

const props = { accounts: [assets, bank, broker], returns: {}, under: null, handle: 'h' };

describe('the accounts table', () => {
	it('puts a group row above its holdings', () => {
		render(AccountsTable, props);

		const group = screen.getByTitle('Assets:Broker').closest('tr');
		const holdings = [...document.querySelectorAll('tr.held')].map((r) => r.textContent);

		expect(group?.classList.contains('group')).toBe(true);
		expect(holdings).toHaveLength(3);
		expect(holdings[2]).toContain('INFY');
	});

	it('reads a lone holding as its account', () => {
		render(AccountsTable, { ...props, accounts: [bank] });

		expect(screen.getByTitle('Assets:Bank').closest('tr')?.classList.contains('held')).toBe(false);
		expect(document.querySelector('tr.group')).toBeNull();
	});

	it('links a holding with lots to its lots', () => {
		render(AccountsTable, props);

		expect(screen.getByRole('link', { name: 'INFY' }).getAttribute('href')).toBe(
			'/l/h/accounts/lots?account=Assets%3ABroker&commodity=INFY',
		);
	});

	it('narrows to the account picked', () => {
		render(AccountsTable, { ...props, under: 'Assets:Broker' });

		expect(screen.queryByTitle('Assets:Bank')).toBeNull();
		expect(screen.getByTitle('Assets:Broker')).toBeTruthy();
	});

	it('counts the groups, one or many', () => {
		const { unmount } = render(AccountsTable, props);

		expect(screen.getByText(/^1 group ·/)).toBeTruthy();
		unmount();

		render(AccountsTable, {
			...props,
			accounts: [...props.accounts, { ...bank, account: 'Liabilities:Card', parent: null }],
		});

		expect(screen.getByText(/^2 groups ·/)).toBeTruthy();
	});
});
