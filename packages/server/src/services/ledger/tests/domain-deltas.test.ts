import { AMOUNT_UNIT, type Amount } from '#services/ledger/domain/amounts.ts';
import { balancesOf, type Delta } from '#services/ledger/domain/deltas.ts';
import type { Aggregate, Bucket, Measure } from '@rupea/shared/balances.ts';
import { describe, expect, it } from 'vitest';

const units = (n: number) => (BigInt(n) * AMOUNT_UNIT) as Amount;

const delta = (d: Partial<Delta>): Delta => ({
	account: 'Assets:Bank',
	commodity: 'INR',
	bucket: '2026-01',
	value: units(0),
	inflow: units(0),
	outflow: units(0),
	units: units(0),
	cost: units(0),
	paid: units(0),
	price: null,
	unpriced: 0,
	...d,
});

const parents = { Assets: null, 'Assets:Bank': 'Assets', 'Assets:Broker': 'Assets' };
const span = {
	from: Temporal.PlainDate.from('2026-01-01'),
	to: Temporal.PlainDate.from('2026-02-28'),
};
const options = {
	span,
	base: 'INR',
	bucket: 'month' as Bucket,
	aggregate: 'sum' as Aggregate,
	measures: ['value'] as Measure[],
	parents,
};

describe('balances of deltas', () => {
	const deltas = [
		delta({ account: 'Assets:Broker', bucket: '2026-02', value: units(5), unpriced: 1 }),
		delta({ account: 'Assets:Bank', bucket: '2026-01', value: units(3) }),
		delta({ account: 'Assets:Bank', bucket: '2026-02', value: units(4) }),
	];

	it('add each account to the accounts above it, ordered by path and then bucket', () => {
		const { rows } = balancesOf(deltas, options);

		expect(rows.map((r) => [r.account, r.bucket, r.value, r.unpriced])).toEqual([
			['Assets', '2026-01', units(3), 0],
			['Assets', '2026-02', units(9), 1],
			['Assets:Bank', '2026-01', units(3), 0],
			['Assets:Bank', '2026-02', units(4), 0],
			['Assets:Broker', '2026-02', units(5), 1],
		]);
	});

	it('give only the measures asked for', () => {
		const { rows } = balancesOf(deltas, { ...options, measures: ['value', 'paid'] });

		expect(Object.keys(rows[0] ?? {}).toSorted()).toEqual(
			['account', 'bucket', 'commodity', 'paid', 'unpriced', 'value'].toSorted(),
		);
	});

	it('leave out accounts the tree does not hold', () => {
		const { rows } = balancesOf(deltas, { ...options, parents: { 'Assets:Bank': null } });

		expect(new Set(rows.map((r) => r.account))).toEqual(new Set(['Assets:Bank']));
	});

	it('tell commodities apart only when units or price are asked, ordered by name', () => {
		const held = [
			delta({ commodity: 'USD', units: units(2) }),
			delta({ commodity: 'AAPL', units: units(1) }),
		];
		const apart = balancesOf(held, { ...options, measures: ['units'] }).rows;
		const together = balancesOf(held, { ...options, measures: ['value'] }).rows;

		expect(apart.filter((r) => r.account === 'Assets').map((r) => r.commodity)).toEqual([
			'AAPL',
			'USD',
		]);
		expect(together.filter((r) => r.account === 'Assets').map((r) => r.commodity)).toEqual([null]);
	});

	it('keep the first price a bucket has', () => {
		const price = (n: number) => ({ amount: units(n), commodity: 'INR' });
		const held = [
			delta({ account: 'Assets:Bank', commodity: 'AAPL', price: null }),
			delta({ account: 'Assets:Broker', commodity: 'AAPL', price: price(7) }),
			delta({ account: 'Assets:Broker', commodity: 'AAPL', bucket: '2026-02', price: null }),
		];
		const { rows } = balancesOf(held, { ...options, measures: ['price'] });

		expect(rows.find((r) => r.account === 'Assets' && r.bucket === '2026-01')?.price).toEqual(
			price(7),
		);
		expect(
			rows.find((r) => r.account === 'Assets' && r.bucket === '2026-02')?.price,
		).toBeUndefined();
	});

	it('divide a day of the month by the months of the span that have it', () => {
		const days = [delta({ bucket: '15', value: units(12), inflow: units(6), outflow: units(6) })];
		const { rows } = balancesOf(days, {
			...options,
			bucket: 'day',
			aggregate: 'average',
			measures: ['value', 'inflow'],
		});

		expect(rows.find((r) => r.account === 'Assets:Bank')).toMatchObject({
			value: units(6),
			inflow: units(3),
		});
	});
});
