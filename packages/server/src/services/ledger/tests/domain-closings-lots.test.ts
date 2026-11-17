import { AMOUNT_UNIT, type Amount } from '#services/ledger/domain/amounts.ts';
import { lotKeyOf, lotsOf, unpricedCostsIn } from '#services/ledger/domain/closings-lots.ts';
import { describe, expect, it } from 'vitest';

const units = (n: number) => (BigInt(n) * AMOUNT_UNIT) as Amount;
const day = (d: string) => Temporal.PlainDate.from(d);

const names = { a: 'Assets:Broker' };
const options = { names, base: 'INR', bought: [], paid: true };
const key = lotKeyOf('Assets:Broker', 'FUND');

const row = (r: { cost: string; paid: string; amount: Amount; accountId?: string }) => ({
	accountId: r.accountId ?? 'a',
	commodity: 'FUND',
	cost: r.cost,
	paid: day(r.paid),
	amount: r.amount,
});

describe('lots of costs', () => {
	it('keep what lots cost before a span apart from what they cost in each bucket', () => {
		const lots = lotsOf(
			{
				openings: [row({ cost: 'INR', paid: '2026-01-01', amount: units(100) })],
				gains: [
					{ ...row({ cost: 'INR', paid: '2026-02-01', amount: units(30) }), bucket: '2026-02' },
					{ ...row({ cost: 'INR', paid: '2026-02-01', amount: units(-10) }), bucket: '2026-03' },
				],
			},
			options,
		);

		expect(lots[key]?.costs).toEqual({
			INR: { opening: units(100), gains: { '2026-02': units(30), '2026-03': units(-10) } },
		});
		expect(lots[key]?.paid).toEqual(lots[key]?.costs['INR']);
	});

	it('value a cost in another commodity at the rate of the day it was paid', () => {
		const bought = [
			{ commodity: 'USD', day: day('2026-01-01'), rate: units(80) },
			{ commodity: 'USD', day: day('2026-02-01'), rate: units(90) },
		];
		const lots = lotsOf(
			{
				openings: [row({ cost: 'USD', paid: '2026-01-01', amount: units(10) })],
				gains: [
					{ ...row({ cost: 'USD', paid: '2026-02-01', amount: units(5) }), bucket: '2026-02' },
				],
			},
			{ ...options, bought },
		);

		expect(lots[key]?.paid).toEqual({ opening: units(800), gains: { '2026-02': units(450) } });
		expect(lots[key]?.costs['USD']).toEqual({ opening: units(10), gains: { '2026-02': units(5) } });
		expect(lots[key]?.unpriced.size).toBe(0);
	});

	it('count nothing for a cost with no rate the day it was paid, and name it when paid is asked', () => {
		const input = {
			openings: [row({ cost: 'USD', paid: '2026-01-01', amount: units(10) })],
			gains: [],
		};

		expect(lotsOf(input, options)[key]?.paid.opening).toBe(0n);
		expect(lotsOf(input, options)[key]?.unpriced).toEqual(new Set(['USD']));
		expect(lotsOf(input, { ...options, paid: false })[key]?.unpriced.size).toBe(0);
	});

	it('name a holding by its account id when the account has no name', () => {
		const lots = lotsOf(
			{
				openings: [row({ accountId: 'z', cost: 'INR', paid: '2026-01-01', amount: units(1) })],
				gains: [],
			},
			options,
		);

		expect(Object.keys(lots)).toEqual([lotKeyOf('z', 'FUND')]);
	});

	it('list each commodity with no rate once, in order', () => {
		const input = {
			openings: [
				row({ cost: 'USD', paid: '2026-01-01', amount: units(1) }),
				row({ cost: 'EUR', paid: '2026-01-01', amount: units(1) }),
				row({ cost: 'USD', paid: '2026-01-02', amount: units(1) }),
			],
			gains: [],
		};

		expect(unpricedCostsIn(lotsOf(input, options))).toEqual(['EUR', 'USD']);
	});
});
