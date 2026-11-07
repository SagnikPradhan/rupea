import { describe, expect, it } from 'vitest';
import { simpleOf } from '#lib/shared/transaction-simple.ts';

const line = (account: string, amount = '', extra = {}) => ({
	account,
	amount,
	commodity: '',
	price: '',
	total: false,
	cost: '',
	costDate: '',
	balance: '',
	comment: '',
	metadata: [],
	...extra,
});

describe('simpleOf', () => {
	it('reads the kind from the account types, and the amount from the first line', () => {
		expect(simpleOf([line('Expenses:Food', '100'), line('Assets:Bank', '-100')])).toEqual({
			kind: 'Expense',
			amount: '100',
			currency: '',
			accounts: ['Expenses:Food', 'Assets:Bank'],
			balances: ['', ''],
		});
		expect(simpleOf([line('Assets:Bank', '500'), line('Income:Salary')])?.kind).toBe('Income');
		expect(simpleOf([line('Assets:Savings', '50'), line('Liabilities:Card')])?.kind).toBe(
			'Transfer',
		);
	});

	it('keeps the currency both lines share', () => {
		const lines = [
			line('Expenses:Food', '9', { commodity: 'USD' }),
			line('Assets:Bank', '-9', { commodity: 'USD' }),
		];

		expect(simpleOf(lines)?.currency).toBe('USD');
	});

	it('takes a half-filled entry, so a blank one can go back to simple', () => {
		expect(simpleOf([line(''), line('')])).toMatchObject({ kind: 'Expense', amount: '' });
		expect(simpleOf([line('Assets:Bank'), line('')])?.kind).toBe('Income');
		expect(simpleOf([line('', '5'), line('', '-6')])).toBeNull();
	});

	it('has no simple form for more or fewer than two lines', () => {
		expect(simpleOf([line('Expenses:Food', '100')])).toBeNull();
		expect(
			simpleOf([
				line('Expenses:Food', '60'),
				line('Expenses:Fuel', '40'),
				line('Assets:Bank', '-100'),
			]),
		).toBeNull();
	});

	it('has none when the accounts fit no kind', () => {
		expect(simpleOf([line('Expenses:Food', '5'), line('Expenses:Fuel', '-5')])).toBeNull();
		expect(simpleOf([line('Equity:Opening', '5'), line('Assets:Bank', '-5')])).toBeNull();
	});

	it('has none when a line carries more than an account and an amount', () => {
		const extras = [
			{ price: '2 USD' },
			{ cost: '10' },
			{ comment: 'note' },
			{ metadata: [{ key: 'k', value: 'v' }] },
		];

		for (const extra of extras)
			expect(simpleOf([line('Expenses:Food', '5', extra), line('Assets:Bank', '-5')])).toBeNull();
	});

	it('takes the amount from whichever line carries it, putting the kinds in order', () => {
		expect(simpleOf([line('Assets:Bank'), line('Income:Salary', '-500')])).toEqual({
			kind: 'Income',
			amount: '500',
			currency: '',
			accounts: ['Assets:Bank', 'Income:Salary'],
			balances: ['', ''],
		});
		expect(simpleOf([line('Income:Refund', '-20'), line('Assets:Bank')])).toMatchObject({
			kind: 'Income',
			amount: '20',
			accounts: ['Assets:Bank', 'Income:Refund'],
		});
		expect(simpleOf([line('Assets:Bank'), line('Expenses:Food', '60')])).toMatchObject({
			kind: 'Expense',
			amount: '60',
			accounts: ['Expenses:Food', 'Assets:Bank'],
		});
	});

	it('keeps a balance assertion with its account, as a bank statement writes it', () => {
		const fromStatement = [
			line('Assets:Checking:HDFC', '', { balance: '2182947.61' }),
			line('Expenses:Travel:Uber', '270.00'),
		];

		expect(simpleOf(fromStatement)).toEqual({
			kind: 'Expense',
			amount: '270.00',
			currency: '',
			accounts: ['Expenses:Travel:Uber', 'Assets:Checking:HDFC'],
			balances: ['', '2182947.61'],
		});
	});

	it('shows a refund as a negative amount', () => {
		expect(simpleOf([line('Expenses:Food', '-100'), line('Assets:Bank', '100')])).toMatchObject({
			kind: 'Expense',
			amount: '-100',
		});
	});

	it('turns a transfer written the other way round into one with a positive amount', () => {
		expect(
			simpleOf([line('Assets:Checking', '-7500', { commodity: 'USD' }), line('Assets:IBKR')]),
		).toEqual({
			kind: 'Transfer',
			amount: '7500',
			currency: 'USD',
			accounts: ['Assets:IBKR', 'Assets:Checking'],
			balances: ['', ''],
		});
	});

	it('has none when the second line is not the opposite of the first', () => {
		expect(simpleOf([line('Expenses:Food', '100'), line('Assets:Bank', '-90')])).toBeNull();
		expect(
			simpleOf([
				line('Expenses:Food', '9', { commodity: 'USD' }),
				line('Assets:Bank', '-9', { commodity: 'EUR' }),
			]),
		).toBeNull();
	});
});
