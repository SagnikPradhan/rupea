import { describe, expect, it } from 'vitest';
import { depthOf, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
import { PARTS } from '#lib/web/shared/chart.ts';
import {
	barsOf,
	monthsIn,
	OTHER,
	partsOf,
	PREVIOUS,
	rowsOf,
	totalOf,
	wholeOf,
	type Spent,
} from '#lib/web/shared/spending.ts';

const spending: Spent = {
	buckets: ['2026-01-01', '2026-02-01'],
	totals: [
		{ account: 'Expenses', amount: '1000' },
		{ account: 'Expenses:Food', amount: '600' },
		{ account: 'Expenses:Food:Groceries', amount: '400' },
		{ account: 'Expenses:Rent', amount: '300.25' },
	],
	spent: [
		{ account: 'Expenses', bucket: '2026-01-01', amount: '700' },
		{ account: 'Expenses:Food', bucket: '2026-01-01', amount: '600' },
		{ account: 'Expenses', bucket: '2026-02-01', amount: '300.25' },
		{ account: 'Expenses:Rent', bucket: '2026-02-01', amount: '300.25' },
	],
};

const previous: Spent = {
	buckets: ['2025-01-01'],
	totals: [{ account: 'Expenses', amount: '800' }],
	spent: [{ account: 'Expenses', bucket: '2025-01-01', amount: '800' }],
};

describe('account names', () => {
	it('tell the depth, the last part and the parents of an account', () => {
		expect(depthOf('Expenses')).toBe(0);
		expect(depthOf('Expenses:Food:Groceries')).toBe(2);
		expect(nameOf('Expenses:Food:Groceries')).toBe('Groceries');
		expect(prefixOf('Expenses:Food:Groceries')).toBe('E:F:');
		expect(prefixOf('Expenses')).toBe('');
	});
});

describe('the parts of a bar', () => {
	it('are the largest accounts right under Expenses, largest first', () => {
		expect(partsOf(spending, 'Expenses')).toEqual(['Expenses:Food', 'Expenses:Rent']);
		expect(partsOf(undefined, 'Expenses')).toEqual([]);
	});

	it('are the accounts right under the one narrowed to', () => {
		expect(partsOf(spending, 'Expenses:Food')).toEqual(['Expenses:Food:Groceries']);
		expect(rowsOf(spending.totals, 'Expenses:Food').map((t) => t.account)).toEqual([
			'Expenses:Food',
			'Expenses:Food:Groceries',
		]);
	});

	it('leave room for the other spending', () => {
		const many = Array.from({ length: PARTS + 2 }, (_, i) => ({
			account: `Expenses:${i}`,
			amount: String(i),
		}));
		expect(partsOf({ ...spending, totals: many }, 'Expenses')).toHaveLength(PARTS - 1);
	});
});

describe('the bars', () => {
	const account = 'Expenses';
	const parts = ['Expenses:Food', 'Expenses:Rent'];

	it('pile each part, and leave the rest to other, to the paisa', () => {
		expect(barsOf({ spending, previous: undefined, account, parts })).toEqual([
			{
				bucket: '2026-01-01',
				total: '700',
				'Expenses:Food': '600',
				'Expenses:Rent': '0',
				[OTHER]: '100',
				[PREVIOUS]: null,
			},
			{
				bucket: '2026-02-01',
				total: '300.25',
				'Expenses:Food': '0',
				'Expenses:Rent': '300.25',
				[OTHER]: '0',
				[PREVIOUS]: null,
			},
		]);
	});

	it('set each bucket against the one as far into the range before', () => {
		const bars = barsOf({ spending, previous, account, parts });
		expect(bars.map((b) => b[PREVIOUS])).toEqual(['800', null]);
	});

	it('add up to the whole range, set against the whole range before', () => {
		expect(wholeOf({ spending, previous, account, parts })).toMatchObject({
			total: '1000',
			[OTHER]: '99.75',
			[PREVIOUS]: '800',
		});
		expect(wholeOf({ spending, previous: undefined, account, parts })[PREVIOUS]).toBeNull();
	});
});

describe('totals', () => {
	it('read what a range spent in all, and nothing without a range', () => {
		expect(totalOf(spending, 'Expenses')).toBe('1000');
		expect(totalOf(spending, 'Expenses:Food')).toBe('600');
		expect(totalOf({ ...spending, totals: [] }, 'Expenses')).toBe('0');
		expect(totalOf(undefined, 'Expenses')).toBeNull();
	});

	it('count months in a span, both of its days included', () => {
		expect(monthsIn('2026-01-01', '2026-12-31')).toBeCloseTo(12, 1);
		expect(monthsIn('2026-01-01', '2026-01-01')).toBeCloseTo(12 / 365.25);
	});
});
