import { describe, expect, it } from 'vitest';
import { isDirectlyUnder, isUnder, drawnIn, namesWith } from '#lib/web/shared/accounts.ts';

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

describe('namesWith', () => {
	const rows = ['Expenses:Food', 'Assets:Bank', 'Expenses'].map((account) => ({
		account,
		parent: null,
		posted: true,
	}));

	it('finds accounts by how they start, in any case, in order', () => {
		expect(namesWith(rows, 'exp')).toEqual(['Expenses', 'Expenses:Food']);
		expect(namesWith(rows, '')).toEqual(['Assets:Bank', 'Expenses', 'Expenses:Food']);
	});

	it('takes a percent sign for itself, and a name inside another for nothing', () => {
		expect(namesWith(rows, '%')).toEqual([]);
		expect(namesWith(rows, 'Bank')).toEqual([]);
	});

	it('gives only a few', () => {
		const many = Array.from({ length: 30 }, (_, i) => ({
			account: `Expenses:A${i}`,
			parent: null,
			posted: true,
		}));
		expect(namesWith(many, 'Exp')).toHaveLength(20);
	});
});

describe('drawnIn', () => {
	it('draws each account under the one that divides, leaving out one in between', () => {
		const rows = [
			{ account: 'Assets', parent: null, posted: false },
			{ account: 'Assets:Bank', parent: 'Assets', posted: false },
			{ account: 'Assets:Bank:HDFC', parent: 'Assets:Bank', posted: true },
		];
		expect(drawnIn(rows)).toEqual([
			{ account: 'Assets', parent: null },
			{ account: 'Assets:Bank:HDFC', parent: 'Assets' },
		]);
	});
});
