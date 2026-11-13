import { describe, expect, it } from 'vitest';
import { isDirectlyUnder, isUnder } from '#lib/web/shared/accounts.ts';

describe('isUnder', () => {
	it('takes an account and those under it, whatever their case, and every account under none', () => {
		expect(isUnder('assets:bank', 'Assets')).toBe(true);
		expect(isUnder('Assets', 'Assets')).toBe(true);
		expect(isUnder('Assets2', 'Assets')).toBe(false);
		expect(isUnder('Liabilities', null)).toBe(true);
	});
});

describe('isDirectlyUnder', () => {
	it('takes a child only, not a grandchild, the account itself or an account under another top', () => {
		expect(isDirectlyUnder('Expenses:Food', 'Expenses')).toBe(true);
		expect(isDirectlyUnder('Expenses:Food:Dining', 'Expenses')).toBe(false);
		expect(isDirectlyUnder('Expenses', 'Expenses')).toBe(false);
		expect(isDirectlyUnder('Assets:Bank', 'Expenses')).toBe(false);
	});
});
