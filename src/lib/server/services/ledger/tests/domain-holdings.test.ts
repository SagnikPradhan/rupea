import { parseAmount, type Amount, type Quantity } from '#services/ledger/domain/amounts.ts';
import { byAccount, valued } from '#services/ledger/domain/holdings.ts';
import { describe, expect, it } from 'vitest';

const amount = (text: string) => parseAmount(text) ?? (0n as Amount);
const quantity = (text: string, commodity = 'INR'): Quantity => ({
	amount: amount(text),
	commodity,
});

const holding = (account: string, units: string, commodity: string, cost: Quantity | null) => ({
	account,
	commodity,
	units: amount(units),
	cost,
});

const prices = { INFY: quantity('1800'), AAPL: quantity('250', 'USD'), USD: quantity('85') };

describe('valued', () => {
	it('values units at their price, and the gain over what they cost', () => {
		expect(
			valued(holding('Assets:Zerodha', '10', 'INFY', quantity('15000')), prices),
		).toMatchObject({
			price: quantity('1800'),
			value: amount('18000'),
			paid: amount('15000'),
			gain: amount('3000'),
		});
	});

	it('follows a price in another commodity to rupees', () => {
		expect(
			valued(holding('Assets:IBKR', '2', 'AAPL', quantity('400', 'USD')), prices),
		).toMatchObject({ value: amount('42500'), paid: amount('34000'), gain: amount('8500') });
	});

	it('leaves what has no price unvalued', () => {
		expect(valued(holding('Assets:Zerodha', '3', 'TCS', quantity('9000')), prices)).toMatchObject({
			price: null,
			value: null,
			gain: null,
		});
	});

	it('values rupees as themselves, with no gain', () => {
		expect(valued(holding('Assets:Bank', '500', 'INR', null), prices)).toMatchObject({
			value: amount('500'),
			gain: null,
		});
	});
});

describe('byAccount', () => {
	const worth = (account: string, units: string, commodity = 'INR', cost: Quantity | null = null) =>
		valued(holding(account, units, commodity, cost), prices);
	/** Draws every account named, each under none. */
	const drawn = (...accounts: string[]) => Object.fromEntries(accounts.map((a) => [a, null]));

	it('lists each account and its parents once, a parent right before its sub-accounts', () => {
		const accounts = byAccount(
			[
				worth('Assets:Zerodha', '10', 'INFY'),
				worth('Assets:Bank', '500'),
				worth('Assets:Bank-2', '50'),
				worth('Assets:Bank:Savings', '200'),
				worth('Assets:Zerodha', '3', 'TCS'),
			],
			drawn('Assets', 'Assets:Bank', 'Assets:Bank:Savings', 'Assets:Bank-2', 'Assets:Zerodha'),
		);

		expect(accounts.map((a) => [a.account, a.total, a.unpriced])).toEqual([
			['Assets', amount('18750'), 1],
			['Assets:Bank', amount('700'), 0],
			['Assets:Bank:Savings', amount('200'), 0],
			['Assets:Bank-2', amount('50'), 0],
			['Assets:Zerodha', amount('18000'), 1],
		]);
		expect(accounts.map((a) => a.holdings.map((h) => h.commodity))).toEqual([
			[],
			['INR'],
			['INR'],
			['INR'],
			['INFY', 'TCS'],
		]);
	});

	it('totals cost and gain over only what has both a cost and a price', () => {
		const [assets] = byAccount(
			[
				worth('Assets:Zerodha', '10', 'INFY', quantity('15000')),
				worth('Assets:IBKR', '2', 'AAPL', quantity('400', 'USD')),
				worth('Assets:Zerodha', '3', 'TCS', quantity('9000')),
				worth('Assets:Bank', '500'),
			],
			drawn('Assets'),
		);

		expect(assets).toMatchObject({ cost: amount('49000'), gain: amount('11500') });
	});

	it('has no cost or gain when nothing under it has both', () => {
		const [bank] = byAccount([worth('Assets', '500')], drawn('Assets'));
		expect(bank).toMatchObject({ cost: null, gain: null });
	});

	it('draws each account under the parent it is given, leaving out one not drawn', () => {
		const accounts = byAccount([worth('Assets:Bank:Savings', '200')], {
			Assets: null,
			'Assets:Bank:Savings': 'Assets',
		});

		expect(accounts.map((a) => [a.account, a.parent])).toEqual([
			['Assets', null],
			['Assets:Bank:Savings', 'Assets'],
		]);
	});
});
