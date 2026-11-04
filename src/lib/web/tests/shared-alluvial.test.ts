import { describe, expect, it } from 'vitest';
import { flowsOf } from '#lib/web/shared/alluvial.ts';
import { OTHER } from '#lib/web/shared/chart.ts';

const rows = [
	{ account: 'Expenses', parent: null, amount: '1000' },
	{ account: 'Expenses:Food', parent: 'Expenses', amount: '600' },
	{ account: 'Expenses:Food:Groceries', parent: 'Expenses:Food', amount: '400' },
	{ account: 'Expenses:Food:Snacks', parent: 'Expenses:Food', amount: '-50' },
	{ account: 'Expenses:Food:Dining', parent: 'Expenses:Food', amount: '250' },
	{ account: 'Expenses:Food:Gum', parent: 'Expenses:Food', amount: '10' },
	{ account: 'Expenses:Rent', parent: 'Expenses', amount: '300' },
	{ account: 'Expenses:Phone', parent: 'Expenses', amount: '100' },
];
const flows = flowsOf({ rows, account: 'Expenses', parts: ['Expenses:Food', 'Expenses:Rent'] });

describe('the flows', () => {
	it('run from the account into its parts and other, then into the accounts under each part large enough to see', () => {
		expect(flows.map((f) => [f.key, f.amount, f.column, f.part, f.from])).toEqual([
			['Expenses', 1000, 0, null, null],
			['Expenses:Food', 600, 1, 0, 'Expenses'],
			['Expenses:Rent', 300, 1, 1, 'Expenses'],
			[OTHER, 100, 1, 2, 'Expenses'],
			['Expenses:Food:Groceries', 400, 2, 0, 'Expenses:Food'],
			['Expenses:Food:Dining', 250, 2, 0, 'Expenses:Food'],
		]);
	});

	it('name only the largest accounts under the parts, so a long history still fits', () => {
		const many = Array.from({ length: 60 }, (_, i) => ({
			account: `Expenses:Food:${i}`,
			parent: 'Expenses:Food',
			amount: String(i + 1),
		}));
		const crowded = flowsOf({
			rows: [
				{ account: 'Expenses', parent: null, amount: '1830' },
				{ account: 'Expenses:Food', parent: 'Expenses', amount: '1830' },
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
				{ account: 'Expenses', parent: null, amount: '600' },
				{ account: 'Expenses:Food', parent: 'Expenses', amount: '600' },
				{ account: 'Expenses:food:Groceries', parent: 'Expenses:Food', amount: '600' },
			],
			account: 'Expenses',
			parts: ['Expenses:Food'],
		});
		expect(cased.at(-1)?.key).toBe('Expenses:food:Groceries');
	});

	it('leave out other when the parts are all of it', () => {
		const whole = flowsOf({
			rows: [
				{ account: 'Expenses', parent: null, amount: '600' },
				{ account: 'Expenses:Food', parent: 'Expenses', amount: '600' },
			],
			account: 'Expenses',
			parts: ['Expenses:Food'],
		});
		expect(whole.map((f) => f.key)).toEqual(['Expenses', 'Expenses:Food']);
	});
});
