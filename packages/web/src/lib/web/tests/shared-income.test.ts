import { describe, expect, it } from 'vitest';
import {
	incomeOf,
	investmentIncomeOf,
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
	const paid = [
		{ day: '2025-12-31', cost: '1000' },
		{ day: '2026-01-31', cost: '1500' },
		{ day: '2026-02-28', cost: '1200' },
	];

	it('splits a month into spent, invested and kept, which add up to the income', () => {
		const lean = { ...spending, deltas: [{ ...spending.deltas[0]!, amount: amount('300') }] };

		expect(monthsOf({ income, spending: lean, paid })[0]).toEqual({
			bucket: '2026-01-01',
			total: '1000.00',
			Spent: '300.00',
			Invested: '500.00',
			Kept: '200.00',
			'From savings': '0.00',
		});
	});

	it('draws spending and investing past the income from savings', () => {
		expect(monthsOf({ income, spending, paid })[0]).toMatchObject({
			Spent: '1000.00',
			Invested: '0.00',
			Kept: '0.00',
			'From savings': '-1000.00',
		});
	});

	it('counts a month of refunds and net sales as nothing out', () => {
		expect(monthsOf({ income, spending, paid })[1]).toMatchObject({
			Spent: '0.00',
			Invested: '0.00',
			Kept: '2000.00',
			'From savings': '0.00',
		});
	});

	it('carries what was paid across a month with no point, and sorts the points', () => {
		const gap = [
			{ day: '2026-03-31', cost: '700' },
			{ day: '2025-12-31', cost: '0' },
			{ day: '2026-01-31', cost: '500' },
		];
		const march = { account: 'Income', bucket: on('2026-03-01'), amount: amount('-900') };
		const wider: Spent = {
			...income,
			buckets: [...income.buckets, on('2026-03-01')],
			deltas: [...income.deltas, march],
		};
		const rows = monthsOf({ income: wider, spending: undefined, paid: gap });

		expect(rows.map((r) => r.Invested)).toEqual(['500.00', '0.00', '200.00']);
	});

	it('weighs each bucket by the day before it and the day it ends', () => {
		const years: Spent = {
			buckets: [on('2025-01-01'), on('2026-01-01')],
			totals: [],
			deltas: [
				{ account: 'Income', bucket: on('2025-01-01'), amount: amount('-900') },
				{ account: 'Income', bucket: on('2026-01-01'), amount: amount('-900') },
			],
		};
		const points = [
			{ day: '2024-12-31', cost: '100' },
			{ day: '2025-12-31', cost: '400' },
			{ day: '2026-11-16', cost: '1000' },
		];
		const rows = monthsOf({ income: years, spending: undefined, paid: points });

		expect(rows.map((r) => r.Invested)).toEqual(['300.00', '600.00']);
	});

	it('reads a day before the first point as the first, so what was held does not count', () => {
		const held = [{ day: '2026-01-15', cost: '9000' }];

		expect(monthsOf({ income, spending: undefined, paid: held })[0]).toMatchObject({
			Invested: '0.00',
		});
	});

	it('has no months without a range', () => {
		expect(monthsOf({ income: undefined, spending: undefined, paid })).toEqual([]);
	});
});

describe('wholeOf', () => {
	it('splits the whole range as one bar, by what the lots gained over it', () => {
		const paid = [
			{ day: '2025-12-31', cost: '1000' },
			{ day: '2026-02-28', cost: '1600' },
		];

		expect(wholeOf({ income, spending, paid })).toEqual({
			bucket: '',
			total: '3000.00',
			Spent: '1200.00',
			Invested: '600.00',
			Kept: '1200.00',
			'From savings': '0.00',
		});
	});

	it('invests nothing without a range', () => {
		expect(wholeOf({ income: undefined, spending: undefined, paid: [] })).toMatchObject({
			Invested: '0.00',
			'From savings': '0.00',
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
				{ account: 'Income:Salary', name: 'Salary', month: amount('1000'), range: amount('2700') },
				{
					account: 'Income:Dividends',
					name: 'Dividends',
					month: amount('100'),
					range: amount('300'),
				},
			],
			total: { month: amount('1100'), range: amount('3000') },
		});
	});
});
