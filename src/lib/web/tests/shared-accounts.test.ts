import { describe, expect, it } from 'vitest';
import { childrenOf, isChildOf, isUnder } from '#lib/web/shared/accounts.ts';

const ACCOUNTS = ['Assets:Bank:HDFC', 'assets:bank:sbi', 'Assets:Cash', 'Liabilities:Card'];

describe('isUnder', () => {
	it('takes an account and those under it, whatever their case, and every account under none', () => {
		expect(isUnder('assets:bank', 'Assets')).toBe(true);
		expect(isUnder('Assets', 'Assets')).toBe(true);
		expect(isUnder('Assets2', 'Assets')).toBe(false);
		expect(isUnder('Liabilities', null)).toBe(true);
	});
});

describe('isChildOf', () => {
	it('takes only the accounts one level under, whatever their case', () => {
		expect(isChildOf('assets:Bank', 'Assets')).toBe(true);
		expect(isChildOf('Assets:Bank:HDFC', 'Assets')).toBe(false);
		expect(isChildOf('Assets', 'Assets')).toBe(false);
	});
});

describe('childrenOf', () => {
	it('names each account one level under once, as first written', () => {
		expect(childrenOf(ACCOUNTS, 'Assets')).toEqual(['Assets:Bank', 'Assets:Cash']);
		expect(childrenOf(ACCOUNTS, 'assets:bank')).toEqual(['Assets:Bank:HDFC', 'assets:bank:sbi']);
	});

	it('names the top accounts under none, and nothing under a leaf', () => {
		expect(childrenOf(ACCOUNTS, null)).toEqual(['Assets', 'Liabilities']);
		expect(childrenOf(ACCOUNTS, 'Assets:Cash')).toEqual([]);
	});
});
