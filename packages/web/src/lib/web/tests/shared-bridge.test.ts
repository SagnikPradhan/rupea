import { describe, expect, it } from 'vitest';
import { stepsOf } from '#lib/web/shared/bridge.ts';

const BRIDGE = {
	start: '1000',
	income: '500',
	expenses: '200',
	shifts: [
		{ account: 'Assets:Gold', amount: '300' },
		{ account: 'Assets:Equity', amount: '-100' },
	],
	other: '0',
	end: '1500',
};

const shape = (steps: ReturnType<typeof stepsOf>) =>
	steps.map((s) => [s.label, s.kind, s.from, s.to]);

describe('the steps of what moved net worth', () => {
	it('runs from the start through income, expenses and the largest price moves to the end', () => {
		expect(shape(stepsOf(BRIDGE))).toEqual([
			['Start', 'total', 0, 1000],
			['Income', 'step', 1000, 1500],
			['Expenses', 'step', 1500, 1300],
			['Gold', 'step', 1300, 1600],
			['Equity', 'step', 1600, 1500],
			['End', 'total', 0, 1500],
		]);
	});

	it('names four groups and folds the rest and what is left over into other', () => {
		const steps = stepsOf({
			...BRIDGE,
			shifts: ['A', 'B', 'C', 'D', 'E'].map((g, i) => ({
				account: `Assets:${g}`,
				amount: `${10 - i}`,
			})),
			other: '5',
			end: '1000',
		});

		expect(steps.map((s) => s.label)).toEqual([
			'Start',
			'Income',
			'Expenses',
			'A',
			'B',
			'C',
			'D',
			'Other',
			'End',
		]);
		expect(steps.find((s) => s.label === 'Other')).toMatchObject({
			from: 1000 + 500 - 200 + 10 + 9 + 8 + 7,
			to: 1000 + 500 - 200 + 10 + 9 + 8 + 7 + 6 + 5,
		});
	});

	it('leaves out other when nothing is left over', () => {
		expect(stepsOf(BRIDGE).some((s) => s.label === 'Other')).toBe(false);
	});
});
