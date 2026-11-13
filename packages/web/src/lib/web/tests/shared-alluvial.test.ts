import { describe, expect, it } from 'vitest';
import { flowsOf, SAVED } from '#lib/web/shared/alluvial.ts';
import { OTHER } from '#lib/web/shared/chart.ts';
import { type Amount, parseAmount } from '@rupea/shared/amounts.ts';

const amount = (t: string) => parseAmount(t) as Amount;

const rows = [
	{ account: 'Expenses', parent: null, amount: amount('1000') },
	{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600') },
	{ account: 'Expenses:Food:Groceries', parent: 'Expenses:Food', amount: amount('400') },
	{ account: 'Expenses:Food:Snacks', parent: 'Expenses:Food', amount: amount('-50') },
	{ account: 'Expenses:Food:Dining', parent: 'Expenses:Food', amount: amount('250') },
	{ account: 'Expenses:Food:Gum', parent: 'Expenses:Food', amount: amount('10') },
	{ account: 'Expenses:Rent', parent: 'Expenses', amount: amount('300') },
	{ account: 'Expenses:Phone', parent: 'Expenses', amount: amount('100') },
];
const flows = flowsOf({ rows, account: 'Expenses', parts: ['Expenses:Food', 'Expenses:Rent'] });

describe('the flows', () => {
	it('run from the account into its parts and other, then into the accounts under each part large enough to see', () => {
		expect(flows.map((f) => [f.key, f.amount, f.column, f.part, f.from])).toEqual([
			['Expenses', 1000, 0, null, null],
			['Expenses:Food', 600, 1, 0, 'Expenses'],
			['Expenses:Rent', 300, 1, 1, 'Expenses'],
			[OTHER, 100, 1, 9, 'Expenses'],
			['Expenses:Food:Groceries', 400, 2, 0, 'Expenses:Food'],
			['Expenses:Food:Dining', 250, 2, 0, 'Expenses:Food'],
		]);
	});

	it('take each part\u2019s colour from the ones given, so it keeps it', () => {
		const coloured = flowsOf({
			rows,
			account: 'Expenses',
			parts: ['Expenses:Food', 'Expenses:Rent'],
			colours: { 'Expenses:Food': 4, 'Expenses:Rent': 1 },
		});

		expect(coloured.map((f) => [f.key, f.part])).toEqual([
			['Expenses', null],
			['Expenses:Food', 4],
			['Expenses:Rent', 1],
			[OTHER, 9],
			['Expenses:Food:Groceries', 4],
			['Expenses:Food:Dining', 4],
		]);
	});

	it('name only the largest accounts under the parts, so a long history still fits', () => {
		const many = Array.from({ length: 60 }, (_, i) => ({
			account: `Expenses:Food:${i}`,
			parent: 'Expenses:Food',
			amount: amount(String(i + 1)),
		}));
		const crowded = flowsOf({
			rows: [
				{ account: 'Expenses', parent: null, amount: amount('1830') },
				{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('1830') },
				...many,
			],
			account: 'Expenses',
			parts: ['Expenses:Food'],
		});
		const last = crowded.filter((f) => f.column === 2);
		expect(last.map((f) => f.amount)).toEqual([60, 59, 58, 57, 56, 55, 54, 53]);
	});

	it('run into the accounts under a part whatever their case', () => {
		const cased = flowsOf({
			rows: [
				{ account: 'Expenses', parent: null, amount: amount('600') },
				{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600') },
				{ account: 'Expenses:food:Groceries', parent: 'Expenses:Food', amount: amount('600') },
			],
			account: 'Expenses',
			parts: ['Expenses:Food'],
		});
		expect(cased.at(-1)?.key).toBe('Expenses:food:Groceries');
	});

	it('leave out other when the parts are all of it', () => {
		const whole = flowsOf({
			rows: [
				{ account: 'Expenses', parent: null, amount: amount('600') },
				{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('600') },
			],
			account: 'Expenses',
			parts: ['Expenses:Food'],
		});
		expect(whole.map((f) => f.key)).toEqual(['Expenses', 'Expenses:Food']);
	});

	it('run from each source of income into income, then into the parts, other and what was kept', () => {
		const kept = flowsOf({
			rows,
			account: 'Expenses',
			parts: ['Expenses:Food', 'Expenses:Rent'],
			income: [
				{ account: 'Income', parent: null, amount: amount('-2000') },
				{ account: 'Income:Dividends', parent: 'Income', amount: amount('-200') },
				{ account: 'Income:Salary', parent: 'Income', amount: amount('-1800') },
				{ account: 'Income:Refund', parent: 'Income', amount: amount('50') },
			],
		});
		expect(kept.map((f) => [f.key, f.amount, f.column, f.from, f.into])).toEqual([
			['Income:Salary', 1800, 0, null, 'Income'],
			['Income:Dividends', 200, 0, null, 'Income'],
			['Income', 2000, 1, null, null],
			['Expenses:Food', 600, 2, 'Income', null],
			['Expenses:Rent', 300, 2, 'Income', null],
			[OTHER, 100, 2, 'Income', null],
			[SAVED, 1000, 2, 'Income', null],
		]);
	});

	it('keep nothing when income falls short of spending, and fall back to the expense tree without income', () => {
		const short = flowsOf({
			rows,
			account: 'Expenses',
			parts: ['Expenses:Food'],
			income: [{ account: 'Income:Salary', parent: 'Income', amount: amount('-500') }],
		});
		expect(short.map((f) => f.key)).not.toContain(SAVED);
		const none = flowsOf({ rows, account: 'Expenses', parts: ['Expenses:Food'], income: [] });
		expect(none[0]?.key).toBe('Expenses');
	});
});
