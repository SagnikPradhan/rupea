import { describe, expect, it } from 'vitest';
import { BalanceAccount, ExpenseAccount, filterOf } from '#lib/shared/filter.ts';
import * as v from 'valibot';

describe('a filter', () => {
	it('reads days beside the range, and drops days that are not ISO dates', () => {
		const filter = filterOf([
			['range', 'ytd'],
			['from', '2026-03-01'],
			['to', '31/03/2026'],
		]);
		expect(filter).toMatchObject({ range: 'ytd', from: '2026-03-01', to: '' });
	});

	it('drops a day that does not exist', () => {
		expect(filterOf([['from', '2026-02-30']]).from).toBe('');
	});

	it('leaves every side open when the URL names none', () => {
		expect(filterOf([])).toEqual({ range: 'all', from: '', to: '', account: '', description: '' });
	});
});

describe('an expense account', () => {
	it('keeps Expenses and the accounts under it', () => {
		expect(v.parse(ExpenseAccount, 'Expenses')).toBe('Expenses');
		expect(v.parse(ExpenseAccount, 'Expenses:Food')).toBe('Expenses:Food');
	});

	it('falls back to Expenses for any other account, or none', () => {
		expect(v.parse(ExpenseAccount, 'Assets:Bank')).toBe('Expenses');
		expect(v.parse(ExpenseAccount, 'ExpensesX')).toBe('Expenses');
		expect(v.parse(ExpenseAccount, null)).toBe('Expenses');
	});
});

describe('a balance account', () => {
	it('is the account given, or none for every balance account when it is empty or missing', () => {
		expect(v.parse(BalanceAccount, 'Assets:Bank')).toBe('Assets:Bank');
		expect(v.parse(BalanceAccount, ' ')).toBeNull();
		expect(v.parse(BalanceAccount, null)).toBeNull();
		expect(v.parse(BalanceAccount, 4)).toBeNull();
	});
});
