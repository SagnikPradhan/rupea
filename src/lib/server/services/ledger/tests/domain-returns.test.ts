import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import type { ValuedHolding } from '#services/ledger/domain/holdings.ts';
import { returnsOf } from '#services/ledger/domain/returns.ts';
import { describe, expect, it } from 'vitest';

const amount = (text: string) => parseAmount(text) ?? (0n as Amount);
const day = (d: string) => Temporal.PlainDate.from(d);

const held = (account: string, value: string | null): ValuedHolding => ({
	account,
	commodity: 'INR',
	units: amount(value ?? '1'),
	cost: null,
	hasLots: false,
	price: null,
	value: value === null ? null : amount(value),
	paid: null,
	gain: null,
});

const flow = (account: string, d: string, value: string, unpriced = 0) => ({
	account,
	day: day(d),
	amount: amount(value),
	unpriced,
});

describe('returnsOf', () => {
	it('solves the rate Excel’s XIRR gives for its own example', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: [],
			end: [held('Assets:Fund', '2750')],
			flows: [
				flow('Assets:Fund', '2008-01-01', '10000'),
				flow('Assets:Fund', '2008-03-01', '-2750'),
				flow('Assets:Fund', '2008-10-30', '-4250'),
				flow('Assets:Fund', '2009-02-15', '-3250'),
			],
			span: { from: day('2008-01-01'), to: day('2009-04-01') },
		});

		expect(returns).toEqual([
			{
				account: 'Assets:Fund',
				netIn: -250_0000000000n,
				xirr: expect.closeTo(0.373362535, 8),
				yearly: true,
				unpriced: 0,
			},
		]);
	});

	it('adds up the accounts under one, where moves between them cancel', () => {
		const returns = returnsOf({
			accounts: ['Assets', 'Assets:Bank', 'Assets:Fund', 'Liabilities:Card'],
			start: [held('Assets:Bank', '1000'), held('Liabilities:Card', '-50')],
			end: [held('Assets:Fund', '1100')],
			flows: [
				flow('Assets:Bank', '2025-01-01', '-1000'),
				flow('Assets:Fund', '2025-01-01', '1000'),
			],
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns.map((r) => [r.account, r.netIn, r.xirr])).toEqual([
			['Assets', 0n, expect.closeTo(0.1, 2)],
			['Assets:Bank', -1000_0000000000n, expect.closeTo(0, 6)],
			['Assets:Fund', 1000_0000000000n, expect.closeTo(0.1, 2)],
		]);
	});

	it('finds a loss of nearly everything, which Newton’s method oversteps', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: [held('Assets:Fund', '100000')],
			end: [held('Assets:Fund', '0.01')],
			flows: [],
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns[0]?.xirr).toBeCloseTo(-0.9999999, 6);
	});

	it('has no rate when nothing went in, or something had no price', () => {
		const returns = returnsOf({
			accounts: ['Assets:Bank', 'Assets:Fund'],
			start: [],
			end: [held('Assets:Bank', '10'), held('Assets:Fund', null)],
			flows: [flow('Assets:Fund', '2025-03-01', '0', 1)],
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns.map((r) => [r.account, r.xirr, r.unpriced])).toEqual([
			['Assets:Bank', null, 0],
			['Assets:Fund', null, 2],
		]);
	});
});
