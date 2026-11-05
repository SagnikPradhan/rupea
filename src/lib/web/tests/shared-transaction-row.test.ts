import { describe, expect, it } from 'vitest';
import { rowOf } from '#lib/web/shared/transaction-row.ts';

const bank = { account: 'Assets:Bank', quantity: '-100.00' };
const food = { account: 'Expenses:Food', quantity: '60.00' };
const gifts = { account: 'Expenses:Gifts', quantity: '40.00' };

describe('the row of a transaction', () => {
	it('goes from the account that gives to the one that gets, for what was given', () => {
		expect(rowOf([food, bank])).toEqual({ from: bank, to: food, more: 0, amount: '100.00' });
	});

	it('counts the accounts after the first that get in a split', () => {
		expect(rowOf([food, gifts, bank])).toMatchObject({ from: bank, to: food, more: 1 });
	});

	it('has no source when nothing is given, and shows what the first line got', () => {
		expect(rowOf([food, gifts])).toEqual({ from: null, to: food, more: 1, amount: '60.00' });
	});

	it('has nothing to show without postings', () => {
		expect(rowOf([])).toEqual({ from: null, to: null, more: 0, amount: null });
	});
});
