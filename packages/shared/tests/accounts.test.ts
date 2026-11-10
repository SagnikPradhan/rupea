import { describe, expect, it } from 'vitest';
import { BalanceAccount, ExpenseAccount, FlowAccount } from '@rupea/shared/accounts.ts';
import * as v from 'valibot';

describe('an expense account', () => {
	it('keeps Expenses and the accounts under it', () => {
		expect(v.parse(ExpenseAccount, 'Expenses')).toBe('Expenses');
		expect(v.parse(ExpenseAccount, ' Expenses:Food ')).toBe('Expenses:Food');
	});

	it('falls back to Expenses for any other account, or none', () => {
		expect(v.parse(ExpenseAccount, 'Assets:Bank')).toBe('Expenses');
		expect(v.parse(ExpenseAccount, 'ExpensesX')).toBe('Expenses');
		expect(v.parse(ExpenseAccount, null)).toBe('Expenses');
	});
});

describe('a flow account', () => {
	it('keeps Expenses, Income and the accounts under them', () => {
		expect(v.parse(FlowAccount, 'Income')).toBe('Income');
		expect(v.parse(FlowAccount, ' income:Salary ')).toBe('income:Salary');
		expect(v.parse(FlowAccount, 'Expenses:Food')).toBe('Expenses:Food');
	});

	it('keeps Liabilities and the accounts under it, which move money too', () => {
		expect(v.parse(FlowAccount, 'Liabilities')).toBe('Liabilities');
		expect(v.parse(FlowAccount, ' liabilities:Loans ')).toBe('liabilities:Loans');
	});

	it('falls back to Expenses for any other account', () => {
		expect(v.parse(FlowAccount, 'Assets:Bank')).toBe('Expenses');
		expect(v.parse(FlowAccount, 'IncomeX')).toBe('Expenses');
	});
});

describe('a balance account', () => {
	it('keeps Assets, Liabilities and the accounts under them', () => {
		expect(v.parse(BalanceAccount, 'Assets')).toBe('Assets');
		expect(v.parse(BalanceAccount, ' Assets:Bank ')).toBe('Assets:Bank');
		expect(v.parse(BalanceAccount, 'Liabilities:Card')).toBe('Liabilities:Card');
		expect(v.parse(BalanceAccount, 'assets:bank')).toBe('assets:bank');
	});

	it('falls back to none, for every balance account, for any other account or none', () => {
		expect(v.parse(BalanceAccount, 'Expenses:Food')).toBeNull();
		expect(v.parse(BalanceAccount, ' ')).toBeNull();
		expect(v.parse(BalanceAccount, null)).toBeNull();
		expect(v.parse(BalanceAccount, 4)).toBeNull();
	});

	it('falls back inside an object whose key is missing', () => {
		expect(v.parse(v.object({ account: BalanceAccount }), {})).toEqual({ account: null });
		expect(v.parse(v.object({ account: ExpenseAccount }), {})).toEqual({ account: 'Expenses' });
	});
});
