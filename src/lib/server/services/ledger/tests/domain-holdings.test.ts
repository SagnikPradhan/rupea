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
			gain: amount('3000'),
		});
	});

	it('follows a price in another commodity to rupees', () => {
		expect(
			valued(holding('Assets:IBKR', '2', 'AAPL', quantity('400', 'USD')), prices),
		).toMatchObject({ value: amount('42500'), gain: amount('8500') });
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
	const worth = (account: string, units: string, commodity = 'INR') =>
		valued(holding(account, units, commodity, null), prices);

	it('lists each account once, in order, with its total and what it holds besides rupees', () => {
		const accounts = byAccount([
			worth('Assets:Zerodha', '10', 'INFY'),
			worth('Assets:Bank', '500'),
			worth('Assets:Zerodha', '100'),
			worth('Assets:Zerodha', '3', 'TCS'),
		]);

		expect(accounts.map((a) => [a.account, a.total, a.unpriced])).toEqual([
			['Assets:Bank', amount('500'), 0],
			['Assets:Zerodha', amount('18100'), 1],
		]);
		expect(accounts.map((a) => a.holdings.map((h) => h.commodity))).toEqual([[], ['INFY', 'TCS']]);
	});
});
