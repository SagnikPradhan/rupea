import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { depthOf, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
import { OTHER, PARTS } from '#lib/web/shared/chart.ts';
import { ALL_ACCOUNTS } from '#lib/web/shared/choices.ts';
import {
	barsOf,
	choicesOf,
	daysIn,
	largestFirst,
	dailyAverageOver,
	monthlyAverageOver,
	partsOf,
	PREVIOUS,
	rowsOf,
	shownOf,
	SpendingQuery,
	totalOf,
	wholeOf,
	type Spent,
} from '#lib/web/shared/spending.ts';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

const amount = (t: string) => parseAmount(t) as Amount;

const on = (d: string) => Temporal.PlainDate.from(d);

const spending: Spent = {
	buckets: [on('2026-01-01'), on('2026-02-01')],
	totals: [
		{ account: 'Expenses', parent: null, amount: amount('1000'), unpriced: 0 },
		{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600'), unpriced: 0 },
		{
			account: 'Expenses:Food:Groceries',
			parent: 'Expenses:Food',
			amount: amount('400'),
			unpriced: 0,
		},
		{ account: 'Expenses:Rent', parent: 'Expenses', amount: amount('300.25'), unpriced: 0 },
	],
	deltas: [
		{ account: 'Expenses', bucket: on('2026-01-01'), amount: amount('700') },
		{ account: 'Expenses:Food', bucket: on('2026-01-01'), amount: amount('600') },
		{ account: 'Expenses', bucket: on('2026-02-01'), amount: amount('300.25') },
		{ account: 'Expenses:Rent', bucket: on('2026-02-01'), amount: amount('300.25') },
	],
};

const previous: Spent = {
	buckets: [on('2025-01-01')],
	totals: [{ account: 'Expenses', parent: null, amount: amount('800'), unpriced: 0 }],
	deltas: [{ account: 'Expenses', bucket: on('2025-01-01'), amount: amount('800') }],
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

describe('the account choices', () => {
	const groups = { 'Expenses:Food': 'Food', 'Expenses:Rent': 'Rent' };

	it('are all accounts and the groups under Expenses by default', () => {
		expect(choicesOf(spending, 'Expenses')).toEqual({ '': ALL_ACCOUNTS, ...groups });
	});

	it('add nothing for a group', () => {
		expect(choicesOf(spending, 'Expenses:Food')).toEqual({ '': ALL_ACCOUNTS, ...groups });
	});

	it('add a deeper account as its own choice', () => {
		expect(choicesOf(spending, 'Expenses:Food:Dining')).toEqual({
			'': ALL_ACCOUNTS,
			...groups,
			'Expenses:Food:Dining': 'Dining',
		});
	});
});

describe('the parts of a bar', () => {
	it('are the largest accounts right under Expenses, largest first', () => {
		expect(partsOf(spending, 'Expenses')).toEqual(['Expenses:Food', 'Expenses:Rent']);
		expect(partsOf(undefined, 'Expenses')).toEqual([]);
	});

	it('are the accounts right under the one narrowed to', () => {
		expect(partsOf(spending, 'Expenses:Food')).toEqual(['Expenses:Food:Groceries']);
		expect(rowsOf(spending, 'Expenses:Food').map((t) => t.account)).toEqual([
			'Expenses:Food',
			'Expenses:Food:Groceries',
		]);
	});

	it('are no rows without spending', () => {
		expect(rowsOf(undefined, 'Expenses')).toEqual([]);
	});

	it('leave room for the other spending', () => {
		const many = Array.from({ length: PARTS + 2 }, (_, i) => ({
			account: `Expenses:${i}`,
			parent: 'Expenses',
			amount: amount(String(i)),
			unpriced: 0,
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
				total: '700.00',
				'Expenses:Food': '600.00',
				'Expenses:Rent': '0.00',
				[OTHER]: '100.00',
				[PREVIOUS]: null,
			},
			{
				bucket: '2026-02-01',
				total: '300.25',
				'Expenses:Food': '0.00',
				'Expenses:Rent': '300.25',
				[OTHER]: '0.00',
				[PREVIOUS]: null,
			},
		]);
	});

	it('set each bucket against the one as far into the range before', () => {
		const bars = barsOf({ spending, previous, account, parts });
		expect(bars.map((b) => b[PREVIOUS])).toEqual(['800.00', null]);
	});

	it('add up to the whole range, set against the whole range before', () => {
		expect(wholeOf({ spending, previous, account, parts })).toMatchObject({
			total: '1000.00',
			[OTHER]: '99.75',
			[PREVIOUS]: '800.00',
		});
		expect(wholeOf({ spending, previous: undefined, account, parts })[PREVIOUS]).toBeNull();
	});
});

describe('totals', () => {
	it('read what a range spent in all, and nothing without a range', () => {
		expect(totalOf(spending, 'Expenses')).toBe(amount('1000'));
		expect(totalOf(spending, 'Expenses:Food')).toBe(amount('600'));
		expect(totalOf({ ...spending, totals: [] }, 'Expenses')).toBe(amount('0'));
		expect(totalOf(undefined, 'Expenses')).toBeNull();
	});

	it('count days in a span, both of its ends included', () => {
		expect(daysIn(on('2026-01-01'), on('2026-01-31'))).toBe(31);
		expect(daysIn(on('2026-01-01'), on('2026-01-01'))).toBe(1);
	});

	it('spread an amount over the days of a span', () => {
		expect(dailyAverageOver(amount('3100'), 31)).toBe(amount('100'));
	});

	it('spread an amount over the average months a span of days covers', () => {
		expect(monthlyAverageOver(amount('4800'), 1461)).toBe(amount('100'));
		expect(monthlyAverageOver(amount('-4800'), 1461)).toBe(amount('-100'));
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
			{ account: 'Expenses', parent: null, amount: amount('100'), unpriced: 0 },
			{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('30'), unpriced: 0 },
			{ account: 'Expenses:Food:Cafe', parent: 'Expenses:Food', amount: amount('5'), unpriced: 0 },
			{
				account: 'Expenses:Food:Grocer',
				parent: 'Expenses:Food',
				amount: amount('25'),
				unpriced: 0,
			},
			{ account: 'Expenses:Rent', parent: 'Expenses', amount: amount('70'), unpriced: 0 },
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

describe('SpendingQuery', () => {
	const read = (query: Record<string, string>) => v.parse(SpendingQuery('2026-11-11'), query);

	it('is the last 12 months of Expenses by default', () => {
		expect(read({})).toEqual({
			account: 'Expenses',
			compare: 'with',
			scale: 'linear',
			span: '',
			dated: false,
			period: { kind: 'custom', from: '2025-11-11', to: '2026-11-11' },
		});
	});

	it('reads a span as the months back from the day', () => {
		const query = read({ span: '3' });
		expect(query.span).toBe('3');
		expect(query.period).toEqual({ kind: 'custom', from: '2026-08-11', to: '2026-11-11' });
		expect(query.dated).toBe(false);
	});

	it('reads a period from the URL when it names no span', () => {
		const query = read({ at: '2026-03', compare: 'without', scale: 'log' });
		expect(query).toMatchObject({ compare: 'without', scale: 'log', dated: true });
		expect(query.period).toEqual({ kind: 'month', at: '2026-03' });
	});

	it('is dated by a period key even when it is empty', () => {
		expect(read({ at: '' }).dated).toBe(true);
	});

	it('falls back to Expenses for an account outside it', () => {
		expect(read({ account: 'Assets:Bank' }).account).toBe('Expenses');
		expect(read({ account: 'Expenses:Food' }).account).toBe('Expenses:Food');
	});

	it('is a schema readQuery accepts', () => {
		const schema: v.GenericSchema<Record<string, string | undefined>, unknown> = SpendingQuery(
			'2026-11-11',
		);
		expect(v.is(schema, {})).toBe(true);
	});
});
