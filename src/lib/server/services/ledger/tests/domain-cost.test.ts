import type { Amount } from '#services/ledger/domain/amounts.ts';
import { costOn, type CostMove } from '#services/ledger/domain/cost.ts';
import { describe, expect, it } from 'vitest';

const day = (d: string) => Temporal.PlainDate.from(d);
const amount = (n: number) => (BigInt(n) * 10n ** 10n) as Amount;
const move = (on: string, n: number, cost = 'INR'): CostMove => ({
	accountId: 'a',
	commodity: 'INFY',
	cost,
	day: day(on),
	amount: amount(n),
});
const DAYS = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'].map(day);

describe('what lots had cost by each day', () => {
	it('adds each move from its own day on, and takes a sale out at the cost of its lot', () => {
		const moves = [move('2026-01-02', 1500), move('2026-01-02', 300), move('2026-01-05', -600)];

		expect(costOn({ moves, rates: [], days: DAYS })).toEqual([0, 1800, 1800, 1200].map(amount));
	});

	it('values a cost in another currency at the rate of the day it was paid', () => {
		const moves = [move('2026-01-02', 100, 'USD'), move('2026-01-05', 100, 'USD')];
		const rates = [
			{ commodity: 'USD', day: day('2026-01-02'), rate: amount(80) },
			{ commodity: 'USD', day: day('2026-01-05'), rate: amount(90) },
		];

		expect(costOn({ moves, rates, days: DAYS })).toEqual([0, 8000, 8000, 17000].map(amount));
	});

	it('leaves out a move whose currency had no rate that day', () => {
		const moves = [move('2026-01-02', 100, 'USD'), move('2026-01-03', 50)];

		expect(costOn({ moves, rates: [], days: DAYS })).toEqual([0, 0, 50, 50].map(amount));
	});

	it('costs nothing without moves', () => {
		expect(costOn({ moves: [], rates: [], days: DAYS })).toEqual([0, 0, 0, 0].map(amount));
	});
});
