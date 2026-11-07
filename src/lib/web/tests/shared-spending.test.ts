import { describe, expect, it } from 'vitest';
import { depthOf, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
import { OTHER, PARTS } from '#lib/web/shared/chart.ts';
import {
	barsOf,
	daysIn,
	largestFirst,
	monthsIn,
	partsOf,
	PREVIOUS,
	rowsOf,
	shownOf,
	totalOf,
	wholeOf,
	type Spent,
} from '#lib/web/shared/spending.ts';

const spending: Spent = {
	buckets: ['2026-01-01', '2026-02-01'],
	totals: [
		{ account: 'Expenses', parent: null, amount: '1000' },
		{ account: 'Expenses:Food', parent: 'Expenses', amount: '600' },
		{ account: 'Expenses:Food:Groceries', parent: 'Expenses:Food', amount: '400' },
		{ account: 'Expenses:Rent', parent: 'Expenses', amount: '300.25' },
	],
	deltas: [
		{ account: 'Expenses', bucket: '2026-01-01', amount: '700' },
		{ account: 'Expenses:Food', bucket: '2026-01-01', amount: '600' },
		{ account: 'Expenses', bucket: '2026-02-01', amount: '300.25' },
		{ account: 'Expenses:Rent', bucket: '2026-02-01', amount: '300.25' },
	],
};

const previous: Spent = {
	buckets: ['2025-01-01'],
	totals: [{ account: 'Expenses', parent: null, amount: '800' }],
	deltas: [{ account: 'Expenses', bucket: '2025-01-01', amount: '800' }],
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
			parent: 'Expenses',
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

	it('count days in a span, both of its ends included', () => {
		expect(daysIn('2026-01-01', '2026-01-31')).toBe(31);
		expect(daysIn('2026-01-01', '2026-01-01')).toBe(1);
	});

	it('count months in a span, both of its days included', () => {
		expect(monthsIn('2026-01-01', '2026-12-31')).toBeCloseTo(12, 1);
		expect(monthsIn('2026-01-01', '2026-01-01')).toBeCloseTo(12 / 365.25);
	});
});

describe('the rows shown', () => {
	const rows = [
		{ account: 'Expenses', parent: null },
		{ account: 'Expenses:Food', parent: 'Expenses' },
		{ account: 'Expenses:Food:Dining', parent: 'Expenses:Food' },
		{ account: 'Expenses:Food:Dining:Cafe', parent: 'Expenses:Food:Dining' },
		{ account: 'Expenses:Rent', parent: 'Expenses' },
	];
	const shown = (opened: string[]) => shownOf(rows, 'Expenses', opened).map((r) => r.account);

	it('show the top account and those right under it until one is opened', () => {
		expect(shown([])).toEqual(['Expenses', 'Expenses:Food', 'Expenses:Rent']);
		expect(shown(['Expenses:Food'])).toEqual([
			'Expenses',
			'Expenses:Food',
			'Expenses:Food:Dining',
			'Expenses:Rent',
		]);
	});

	it('hide what an opened account holds while an account above it is closed', () => {
		expect(shown(['Expenses:Food:Dining'])).toEqual(['Expenses', 'Expenses:Food', 'Expenses:Rent']);
	});
});

describe('the largest first', () => {
	it('order each level by amount, keeping every account above those under it', () => {
		const rows = [
			{ account: 'Expenses', parent: null, amount: '100' },
			{ account: 'Expenses:Food', parent: 'Expenses', amount: '30' },
			{ account: 'Expenses:Food:Cafe', parent: 'Expenses:Food', amount: '5' },
			{ account: 'Expenses:Food:Grocer', parent: 'Expenses:Food', amount: '25' },
			{ account: 'Expenses:Rent', parent: 'Expenses', amount: '70' },
		];
		expect(largestFirst(rows, 'Expenses').map((r) => r.account)).toEqual([
			'Expenses',
			'Expenses:Rent',
			'Expenses:Food',
			'Expenses:Food:Grocer',
			'Expenses:Food:Cafe',
		]);
	});
});
