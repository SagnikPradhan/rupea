import { describe, expect, it } from 'vitest';
import { rowOf } from '#lib/web/shared/transaction-row.ts';

const bank = { account: 'Assets:Bank', quantity: '-100.00' };
const food = { account: 'Expenses:Food', quantity: '100.00' };
const gifts = { account: 'Expenses:Gifts', quantity: '40.00' };

describe('the row of a transaction', () => {
	it('takes the asset or liability as the account and the other line as the category', () => {
		expect(rowOf([food, bank])).toEqual({ side: bank, category: food, split: 0 });
	});

	it('counts the lines of a split instead of picking a category', () => {
		expect(rowOf([food, gifts, bank])).toEqual({ side: bank, category: null, split: 3 });
	});

	it('has nothing to show without postings', () => {
		expect(rowOf([])).toEqual({ side: undefined, category: null, split: 0 });
	});
});
