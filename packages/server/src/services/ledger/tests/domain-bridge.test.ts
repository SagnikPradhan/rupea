import { AMOUNT_UNIT, type Amount } from '#services/ledger/domain/amounts.ts';
import { bridgeOf } from '#services/ledger/domain/bridge.ts';
import type { Row } from '#services/ledger/domain/deltas.ts';
import { describe, expect, it } from 'vitest';

const units = (n: number) => (BigInt(n) * AMOUNT_UNIT) as Amount;

const row = (account: string, bucket: string, value: number): Row => ({
	account,
	commodity: null,
	bucket,
	value: units(value),
	unpriced: 0,
});

const span = {
	from: Temporal.PlainDate.from('2025-03-01'),
	to: Temporal.PlainDate.from('2026-06-30'),
};

describe('bridge of balances', () => {
	const start = [
		row('Assets', '2025-03-01', 1000),
		row('Assets:Bank', '2025-03-01', 1000),
		row('Liabilities', '2025-03-01', -100),
		row('Liabilities:Card', '2025-03-01', -100),
	];
	const end = [
		row('Assets', '2025', 1100),
		row('Assets:Bank', '2025', 1100),
		row('Assets', '2026', 1950),
		row('Assets:Bank', '2026', 1150),
		row('Assets:Bank:Savings', '2026', 1150),
		row('Assets:Zerodha', '2026', 800),
		row('Liabilities', '2026', -150),
		row('Liabilities:Card', '2026', -150),
	];
	const gains = [
		row('Assets', '2025', 100),
		row('Assets:Bank', '2025', 100),
		row('Assets', '2026', 450),
		row('Assets:Bank', '2026', 50),
		row('Assets:Zerodha', '2026', 400),
		row('Income', '2025', -300),
		row('Income', '2026', -200),
		row('Expenses', '2026', 150),
		row('Liabilities', '2026', -50),
		row('Liabilities:Card', '2026', -50),
	];

	it('takes the start from the first day and the end from the last bucket', () => {
		const bridge = bridgeOf({ ...span, start, end, gains });

		expect(bridge).toMatchObject({ ...span, start: units(900), end: units(1800) });
	});

	it('reads income as what came in and expenses as what went out', () => {
		const bridge = bridgeOf({ ...span, start, end, gains });

		expect(bridge).toMatchObject({ income: units(500), expenses: units(150) });
	});

	it('gives each group what its balance changed by beyond what it gained', () => {
		const bridge = bridgeOf({ ...span, start, end, gains });

		expect(bridge.shifts).toEqual([{ account: 'Assets:Zerodha', amount: units(400) }]);
	});

	it('counts a liability that grew beyond what it gained as a price move too', () => {
		const grown = [...end, row('Liabilities:Loan', '2026', -30)];
		const bridge = bridgeOf({ ...span, start, end: grown, gains });

		expect(bridge.shifts.map((s) => s.account)).toEqual(['Assets:Zerodha', 'Liabilities:Loan']);
	});

	it('keeps what is left as other, so the parts add up to the change', () => {
		const bridge = bridgeOf({ ...span, start, end, gains });
		const parts = [bridge.income, -bridge.expenses, bridge.other];
		const moved = bridge.shifts.reduce((t, s) => t + s.amount, 0n);

		expect(bridge.other).toBe(units(150));
		expect(parts.reduce((t, a) => t + a, 0n) + moved).toBe(bridge.end - bridge.start);
	});

	it('leaves out a group whose balance changed by what it gained', () => {
		const bridge = bridgeOf({ ...span, start, end, gains });

		expect(bridge.shifts.map((s) => s.account)).not.toContain('Assets:Bank');
	});

	it('has no income, expenses or shifts for a span of one day', () => {
		const day = { from: span.from, to: span.from };
		const only = [row('Assets', '2025', 1000), row('Assets:Bank', '2025', 1000)];
		const bridge = bridgeOf({ ...day, start: only, end: only, gains: [] });

		expect(bridge).toEqual({
			...day,
			start: units(1000),
			income: 0n,
			expenses: 0n,
			shifts: [],
			other: 0n,
			end: units(1000),
		});
	});
});
