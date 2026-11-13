import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	Amount,
	AmountOut,
	BalanceAccount,
	ExpenseAccount,
	FlowAccount,
	PostedOut,
	parseAmount,
	printPosted,
} from '@rupea/shared/money.ts';

describe('an amount', () => {
	it('reads a decimal string without losing a digit', () => {
		expect(v.parse(Amount, '1250.5')).toBe(1250_5000000000n);
		expect(v.parse(Amount, '-0.0000000001')).toBe(-1n);
	});

	it('refuses what a decimal string is not', () => {
		const refused = ['1,250.50', '₹10', '1.00000000001', '', '1e3'];
		expect(refused.filter((text) => v.safeParse(Amount, text).success)).toEqual([]);
	});

	it('holds 28 whole digits, as many as the database column', () => {
		const most = `${'9'.repeat(28)}.9999999999`;
		expect(v.parse(Amount, most)).toBe(10n ** 38n - 1n);
		expect(v.parse(Amount, `-${most}`)).toBe(-(10n ** 38n) + 1n);
		expect(v.safeParse(Amount, `1${'0'.repeat(28)}`).success).toBe(false);
		expect(parseAmount(`1${'0'.repeat(28)}`)).toBeNull();
	});

	it('reads the same decimals on the wire as parseAmount does', () => {
		expect(v.parse(Amount, '+5.5')).toBe(parseAmount('+5.5'));
		expect(parseAmount('+5.5')).toBe(5_5000000000n);
		expect(parseAmount('₹1,250.50')).toBe(1250_5000000000n);
	});

	it('goes out as the string it reads back', () => {
		const text = v.parse(AmountOut, -2000_5000000000n);
		expect(text).toBe('-2000.50');
		expect(v.parse(Amount, text)).toBe(-2000_5000000000n);
		expect(v.safeParse(AmountOut, '1.00').success).toBe(false);
	});
});

const amount = (text: string) => parseAmount(text) as Amount;

const wire = (posted: {
	amount: string;
	commodity: string;
	price?: { amount: string; commodity: string; kind: 'unit' | 'total' };
	cost?: { amount: string; commodity: string; date: Temporal.PlainDate | null };
}) =>
	v.parse(PostedOut, {
		amount: amount(posted.amount),
		commodity: posted.commodity,
		price: posted.price ? { ...posted.price, amount: amount(posted.price.amount) } : null,
		cost: posted.cost ? { ...posted.cost, amount: amount(posted.cost.amount) } : null,
	});

describe('printing a posting', () => {
	it('leaves the rupee out of a plain amount', () => {
		expect(printPosted(wire({ amount: '2000.5', commodity: 'INR' }))).toBe('2000.50');
	});

	it('keeps a sign', () => {
		expect(printPosted(wire({ amount: '-15001.25', commodity: 'INR' }))).toBe('-15001.25');
	});

	it('names another commodity', () => {
		expect(printPosted(wire({ amount: '10', commodity: 'INFY' }))).toBe('10.00 INFY');
	});

	it('shows a unit price with @ and a total price with @@', () => {
		const price = { amount: '1500.125', commodity: 'INR' };
		const unit = wire({ amount: '10', commodity: 'INFY', price: { ...price, kind: 'unit' } });
		const total = wire({ amount: '10', commodity: 'INFY', price: { ...price, kind: 'total' } });
		expect(printPosted(unit)).toBe('10.00 INFY @ 1500.125');
		expect(printPosted(total)).toBe('10.00 INFY @@ 1500.125');
	});

	it('shows a lot cost with its date, and before a price', () => {
		const cost = { amount: '1400', commodity: 'INR' };
		const posted = {
			amount: '-5',
			commodity: 'INFY',
			price: { amount: '1500', commodity: 'INR', kind: 'unit' as const },
		};
		const dated = { ...cost, date: Temporal.PlainDate.from('2026-01-02') };
		expect(printPosted(wire({ ...posted, cost: dated }))).toBe(
			'-5.00 INFY {1400.00, 2026-01-02} @ 1500.00',
		);
		expect(printPosted(wire({ ...posted, cost: { ...cost, date: null } }))).toBe(
			'-5.00 INFY {1400.00} @ 1500.00',
		);
	});
});

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
