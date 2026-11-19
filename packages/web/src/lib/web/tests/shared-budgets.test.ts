import { describe, expect, it } from 'vitest';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
import {
	overOf,
	rowsFor,
	startOf,
	startsOnOf,
	subtitleOf,
	type BudgetView,
} from '#lib/web/shared/budgets.ts';

const amount = (t: string) => parseAmount(t) as Amount;

const budget = (account: string, limit: string, spent: string, length = 'month') =>
	({
		account,
		length,
		from: Temporal.PlainDate.from('2026-11-01'),
		to: Temporal.PlainDate.from('2026-11-30'),
		limit: amount(limit),
		spent: amount(spent),
		left: amount(limit),
		current: {},
	}) as BudgetView;

const rows = (...b: [string, string, string, string?][]) =>
	rowsFor(
		b.map((x) => budget(...x)),
		'Expenses',
	);

describe('rowsFor', () => {
	it('keeps the budgets of the account and those under it', () => {
		const listed = rowsFor(
			[budget('Expenses:Food', '100', '10'), budget('Assets:Cash', '100', '10')],
			'Expenses',
		);

		expect(listed.map((r) => r.budget.account)).toEqual(['Expenses:Food']);
	});

	it('rounds the percent spent to a whole number', () => {
		const [low, half] = rows(['Expenses:A', '3', '1'], ['Expenses:B', '8', '1']);

		expect(low?.percent).toBe(33);
		expect(half?.percent).toBe(13);
		expect(rows(['Expenses:A', '200', '1'])[0]?.percent).toBe(1);
		expect(rows(['Expenses:A', '200', '99'])[0]?.percent).toBe(50);
	});

	it('is over only when it spent more than the limit', () => {
		const [exact, past] = rows(['Expenses:A', '100', '100'], ['Expenses:B', '100', '101']).toSorted(
			(a, b) => a.budget.account.localeCompare(b.budget.account),
		);

		expect(exact?.over).toBe(false);
		expect(past?.over).toBe(true);
	});

	it('shows no percent for a limit of zero, and is over once anything is spent', () => {
		const [spent, none] = rows(['Expenses:A', '0', '5'], ['Expenses:B', '0', '0']);

		expect(spent).toMatchObject({ percent: null, over: true });
		expect(none).toMatchObject({ percent: null, over: false });
	});

	it('draws the bar on the larger of the spent and the limit', () => {
		const [under, over, zero] = rows(
			['Expenses:C', '100', '50'],
			['Expenses:B', '100', '200'],
			['Expenses:A', '0', '0'],
		).toSorted((a, b) => b.budget.account.localeCompare(a.budget.account));

		expect(under?.bar).toEqual({ share: 0.5, limit: 1 });
		expect(over?.bar).toEqual({ share: 1, limit: 0.5 });
		expect(zero?.bar).toEqual({ share: 0, limit: 0 });
	});

	it('sorts by percent, a limit of zero first, ties by account', () => {
		const listed = rows(
			['Expenses:Food', '100', '50'],
			['Expenses:Gifts', '100', '150'],
			['Expenses:Bus', '100', '50'],
			['Expenses:Fun', '0', '5'],
		);

		expect(listed.map((r) => r.budget.account)).toEqual([
			'Expenses:Fun',
			'Expenses:Gifts',
			'Expenses:Bus',
			'Expenses:Food',
		]);
	});
});

describe('subtitleOf', () => {
	it('counts the budgets and those over', () => {
		const listed = rows(
			['Expenses:A', '10', '20'],
			['Expenses:B', '10', '30'],
			['Expenses:C', '10', '1'],
		);

		expect(subtitleOf(listed)).toBe('3 budgets · 2 over');
	});

	it('says none over, and 1 budget in the singular', () => {
		expect(subtitleOf(rows(['Expenses:A', '10', '1']))).toBe('1 budget · none over');
		expect(subtitleOf(rows(['Expenses:A', '10', '11']))).toBe('1 budget · 1 over');
	});

	it('says there are none when no budget is listed', () => {
		expect(subtitleOf([])).toBe('No budgets');
	});
});

describe('overOf', () => {
	const over = (name: string) => ['Expenses:' + name, '1', '2'] as [string, string, string];

	it('names the accounts over by their last segment', () => {
		expect(overOf(rows(over('Gifts'), ['Expenses:Food', '9', '1'], over('Dining')))).toEqual({
			figure: '2 of 3',
			detail: 'Dining and Gifts',
		});
		expect(overOf(rows(over('Gifts')))).toEqual({ figure: '1 of 1', detail: 'Gifts' });
	});

	it('names two and counts the rest', () => {
		const listed = rows(over('Gifts'), over('Dining'), over('Fun'), over('Bus'));

		expect(overOf(listed).detail).toBe('Bus, Dining and 2 more');
		expect(overOf(rows(over('Gifts'), over('Dining'), over('Fun'))).detail).toBe(
			'Dining, Fun and 1 more',
		);
	});

	it('says none over when nothing is', () => {
		expect(overOf(rows(['Expenses:A', '9', '1']))).toEqual({
			figure: '0 of 1',
			detail: 'None over',
		});
	});

	it('shows a dash when no budget is set', () => {
		expect(overOf([])).toEqual({ figure: '–', detail: 'None set' });
	});
});

describe('startOf', () => {
	const today = Temporal.PlainDate.from('2026-11-19');

	it('gives null for the 1st and for January', () => {
		expect(startOf({ length: 'month', on: 1, today })).toBeNull();
		expect(startOf({ length: 'year', on: 1, today })).toBeNull();
	});

	it('takes the day of this month once it has come', () => {
		expect(startOf({ length: 'month', on: 15, today })).toBe('2026-11-15');
		expect(startOf({ length: 'month', on: 19, today })).toBe('2026-11-19');
	});

	it('takes the day of last month while it is still ahead', () => {
		expect(startOf({ length: 'month', on: 25, today })).toBe('2026-10-25');
	});

	it.each([
		[31, '2026-03-15', '2026-01-31'],
		[31, '2026-04-30', '2026-03-31'],
		[31, '2026-12-05', '2026-10-31'],
		[31, '2026-05-31', '2026-05-31'],
		[29, '2026-03-15', '2026-01-29'],
		[29, '2028-03-15', '2028-02-29'],
		[29, '2028-03-29', '2028-03-29'],
		[30, '2026-03-15', '2026-01-30'],
		[30, '2026-04-30', '2026-04-30'],
	])('anchors day %i on a real date, as of %s', (on, day, expected) => {
		expect(startOf({ length: 'month', on, today: Temporal.PlainDate.from(day) })).toBe(expected);
	});

	it('takes the 1st of the month this year once it has come, else last year', () => {
		expect(startOf({ length: 'year', on: 4, today })).toBe('2026-04-01');
		expect(startOf({ length: 'year', on: 11, today })).toBe('2026-11-01');
		expect(startOf({ length: 'year', on: 12, today })).toBe('2025-12-01');
	});
});

describe('startsOnOf', () => {
	it('reads the day of the month or the month of the year', () => {
		expect(startsOnOf({ start: '2026-10-25' })).toEqual({ on: 25 });
		expect(startsOnOf({ start: '2026-04-01', period: 'year' })).toEqual({ on: 4 });
	});

	it('is 1 for a start it cannot read', () => {
		expect(startsOnOf({ start: '01/04/2026' })).toEqual({ on: 1 });
		expect(startsOnOf({ start: '2026-13-45', period: 'year' })).toEqual({ on: 1 });
	});

	it('is 1 without a start', () => {
		expect(startsOnOf({})).toEqual({ on: 1 });
		expect(startsOnOf({ period: 'year' })).toEqual({ on: 1 });
	});
});
