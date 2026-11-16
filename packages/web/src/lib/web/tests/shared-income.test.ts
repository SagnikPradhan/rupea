import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	incomeOf,
	investmentIncomeOf,
	IncomeQuery,
	monthsOf,
	sourcesOf,
	wholeOf,
} from '#lib/web/shared/income.ts';
import type { Spent } from '#lib/web/shared/spending.ts';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

const amount = (t: string) => parseAmount(t) as Amount;
const on = (d: string) => Temporal.PlainDate.from(d);

const income: Spent = {
	buckets: [on('2026-01-01'), on('2026-02-01')],
	totals: [
		{ account: 'Income', parent: null, amount: amount('-3000'), unpriced: 0 },
		{ account: 'Income:Salary', parent: 'Income', amount: amount('-2700'), unpriced: 0 },
		{ account: 'Income:Dividends', parent: 'Income', amount: amount('-300'), unpriced: 0 },
	],
	deltas: [
		{ account: 'Income', bucket: on('2026-01-01'), amount: amount('-1000') },
		{ account: 'Income', bucket: on('2026-02-01'), amount: amount('-2000') },
		{ account: 'Income:Salary', bucket: on('2026-02-01'), amount: amount('-2000') },
	],
};

const spending: Spent = {
	buckets: income.buckets,
	totals: [{ account: 'Expenses', parent: null, amount: amount('1200'), unpriced: 0 }],
	deltas: [
		{ account: 'Expenses', bucket: on('2026-01-01'), amount: amount('1500') },
		{ account: 'Expenses', bucket: on('2026-02-01'), amount: amount('-300') },
	],
};

describe('incomeOf', () => {
	it('reads income without the minus it is credited with', () => {
		expect(incomeOf(income, 'Income')).toBe(amount('3000'));
		expect(incomeOf(income, 'Income:Salary')).toBe(amount('2700'));
	});

	it('is nothing for an account the range has none of, or no range', () => {
		expect(incomeOf(income, 'Income:Interest')).toBe(amount('0'));
		expect(incomeOf(undefined, 'Income')).toBe(amount('0'));
	});
});

describe('investmentIncomeOf', () => {
	it('adds the interest and dividends accounts that are there', () => {
		expect(investmentIncomeOf(income)).toBe(amount('300'));
	});
});

describe('monthsOf', () => {
	it('splits each month of income into what was spent and what was kept', () => {
		expect(monthsOf(income, spending)).toEqual([
			{ bucket: '2026-01-01', total: '1000.00', Spent: '1500.00', Saved: '-500.00' },
			{ bucket: '2026-02-01', total: '2000.00', Spent: '-300.00', Saved: '2300.00' },
		]);
	});

	it('has no months without a range', () => {
		expect(monthsOf(undefined, undefined)).toEqual([]);
	});
});

describe('wholeOf', () => {
	it('splits the whole range the same way as a month', () => {
		expect(wholeOf(income, spending)).toEqual({
			bucket: '',
			total: '3000.00',
			Spent: '1200.00',
			Saved: '1800.00',
		});
	});
});

describe('sourcesOf', () => {
	it('lists each account under Income for a month and for the range, the largest first', () => {
		const month: Spent = {
			...income,
			totals: [
				{ account: 'Income', parent: null, amount: amount('-1100'), unpriced: 0 },
				{ account: 'Income:Salary', parent: 'Income', amount: amount('-1000'), unpriced: 0 },
				{ account: 'Income:Dividends', parent: 'Income', amount: amount('-100'), unpriced: 0 },
			],
		};

		expect(sourcesOf(month, income)).toEqual({
			rows: [
				{ name: 'Salary', month: amount('1000'), range: amount('2700') },
				{ name: 'Dividends', month: amount('100'), range: amount('300') },
			],
			total: { month: amount('1100'), range: amount('3000') },
		});
	});
});

describe('IncomeQuery', () => {
	const read = (q: Record<string, string>) => v.parse(IncomeQuery('2026-11-16'), q);

	it('reads the last 12 months when the URL picks no period', () => {
		const query = read({});

		expect(query.dated).toBe(false);
		expect(query.period).toEqual({ kind: 'custom', from: '2025-11-16', to: '2026-11-16' });
	});

	it('reads a span chip ending today', () => {
		expect(read({ span: '3' }).period).toEqual({
			kind: 'custom',
			from: '2026-08-16',
			to: '2026-11-16',
		});
	});

	it('reads a period of its own, and says the URL dated it', () => {
		const query = read({ at: '2026-03' });

		expect(query.dated).toBe(true);
		expect(query.period).toEqual({ kind: 'month', at: '2026-03' });
	});
});
