import { describe, expect, it } from 'vitest';
import { edgeAt, flowsOf, layoutOf, NODE, nodeAt } from '#lib/web/shared/alluvial.ts';
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
		expect(flows.map((f) => [f.account, f.amount, f.column, f.part, f.from])).toEqual([
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
		expect(layoutOf(crowded, { width: 400, height: 192 }).nodes.every((n) => n.height > 0)).toBe(
			true,
		);
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
		expect(cased.at(-1)?.account).toBe('Expenses:food:Groceries');
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
		expect(whole.map((f) => f.account)).toEqual(['Expenses', 'Expenses:Food']);
	});
});

describe('the layout', () => {
	const layout = layoutOf(flows, { width: 400, height: 200 });
	const food = layout.nodes.find((n) => n.account === 'Expenses:Food');
	const dining = layout.bands.find((b) => b.account === 'Expenses:Food:Dining');

	it('stacks every column at one scale, centred, the first and last at the edges', () => {
		expect(layout.nodes.map((n) => n.x)).toEqual([0, 196, 196, 196, 392, 392]);
		expect(layout.nodes[0]?.height).toBeCloseTo(192);
		expect(layout.nodes[0]?.y).toBeCloseTo(4);
		expect(food?.height).toBeCloseTo(115.2);
	});

	it('runs each band from below its siblings’ in the parent into the whole of its bar', () => {
		expect(dining).toMatchObject({ x0: 196 + NODE, x1: 392 });
		expect(dining?.y0).toBeCloseTo((food?.y ?? 0) + 76.8);
		expect(dining?.height).toBeCloseTo(48);
		if (!dining) throw new Error('No band');
		expect(edgeAt(dining, dining.x0)).toBeCloseTo(dining.y0);
		expect(edgeAt(dining, dining.x1)).toBeCloseTo(dining.y1);
	});

	it('finds the bar under a point, or the bar a band there runs into', () => {
		expect(nodeAt(layout, 198, (food?.y ?? 0) + 1)?.account).toBe('Expenses:Food');
		if (!dining) throw new Error('No band');
		const x = (dining.x0 + dining.x1) / 2;
		expect(nodeAt(layout, x, edgeAt(dining, x) + 1)?.account).toBe('Expenses:Food:Dining');
		expect(nodeAt(layout, 100, 0)).toBeUndefined();
	});
});
