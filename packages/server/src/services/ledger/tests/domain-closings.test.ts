import { AMOUNT_UNIT, type Amount } from '#services/ledger/domain/amounts.ts';
import { closingsOf, holdingsOf, type Holding } from '#services/ledger/domain/closings.ts';
import { lotKeyOf, type Lots } from '#services/ledger/domain/closings-lots.ts';
import { describe, expect, it } from 'vitest';

const units = (n: number) => (BigInt(n) * AMOUNT_UNIT) as Amount;
const day = (d: string) => Temporal.PlainDate.from(d);

const holding = (o: Partial<Holding>): Holding => ({
	account: 'Assets:Broker',
	commodity: 'FUND',
	opening: units(0),
	gains: {},
	...o,
});

const ends = ['2026-01-31', '2026-02-28', '2026-03-31'].map(day);

describe('closings', () => {
	const options = { base: 'INR', bucket: 'month', ends } as const;

	it('add each bucket’s gain to the opening and carry the sum through buckets with none', () => {
		const held = holding({
			opening: units(5),
			gains: { '2026-01': units(2), '2026-03': units(-3) },
		});
		const { rows } = closingsOf([held], { ...options, ratesFor: () => [10n, 10n, 10n] });

		expect(rows.map((r) => [r.bucket, r.units])).toEqual([
			['2026-01', units(7)],
			['2026-02', units(7)],
			['2026-03', units(4)],
		]);
	});

	it('value units at the rate of the day each bucket is valued on', () => {
		const held = holding({ opening: units(2) });
		const rates = [3n * AMOUNT_UNIT, 4n * AMOUNT_UNIT, null];
		const { rows, unpriced } = closingsOf([held], { ...options, ratesFor: () => rates });

		expect(rows.map((r) => [r.value, r.unpriced])).toEqual([
			[units(6), 0],
			[units(8), 0],
			[0n, 1],
		]);
		expect(unpriced).toEqual([held]);
	});

	it('can value every bucket at one day by giving that day’s rate to each', () => {
		const held = holding({ gains: { '2026-01': units(1), '2026-02': units(1) } });
		const now = 50n * AMOUNT_UNIT;
		const { rows } = closingsOf([held], { ...options, ratesFor: () => ends.map(() => now) });

		expect(rows.map((r) => r.value)).toEqual([units(50), units(100), units(100)]);
	});

	it('leave the base unconverted, and a holding of nothing unpriced', () => {
		const base = holding({ commodity: 'INR', opening: units(100) });
		const none = holding({ commodity: 'GHOST' });
		const asked: string[] = [];
		const { rows, unpriced } = closingsOf([base, none], {
			...options,
			ratesFor: (c) => {
				asked.push(c);
				return [null, null, null];
			},
		});

		expect(rows.map((r) => [r.commodity, r.value, r.unpriced])).toEqual([
			['INR', units(100), 0],
			['INR', units(100), 0],
			['INR', units(100), 0],
			['GHOST', 0n, 0],
			['GHOST', 0n, 0],
			['GHOST', 0n, 0],
		]);
		expect(asked).toEqual(['GHOST']);
		expect(unpriced).toEqual([]);
	});

	it('name each holding once however many buckets it went unpriced in', () => {
		const held = holding({ opening: units(1) });
		const { unpriced } = closingsOf([held], { ...options, ratesFor: () => [null, null, null] });

		expect(unpriced).toEqual([held]);
	});
});

describe('closings of lots', () => {
	const options = { base: 'INR', bucket: 'month', ends } as const;
	const held = holding({ commodity: 'AAPL', opening: units(2) });
	const lots = (l: Partial<Lots> = {}) => ({
		[lotKeyOf('Assets:Broker', 'AAPL')]: {
			paid: { opening: units(160), gains: { '2026-02': units(45) } },
			costs: { USD: { opening: units(2), gains: { '2026-02': units(1) } } },
			unpriced: new Set<string>(),
			...l,
		},
	});
	const ratesFor = (c: string) =>
		(c === 'USD' ? [90n, 100n, 110n] : [10n, 20n, 30n]).map((r) => r * AMOUNT_UNIT);

	it('convert what lots cost at each bucket’s rate and add up what was paid', () => {
		const { rows } = closingsOf([held], { ...options, lots: lots(), ratesFor });

		expect(rows.map((r) => [r.cost, r.paid])).toEqual([
			[units(180), units(160)],
			[units(300), units(205)],
			[units(330), units(205)],
		]);
	});

	it('quote the price of a unit in the base, and none for the base', () => {
		const base = holding({ commodity: 'INR', opening: units(1) });
		const { rows } = closingsOf([held, base], { ...options, ratesFor });

		expect(rows.map((r) => r.price?.amount)).toEqual([
			units(10),
			units(20),
			units(30),
			undefined,
			undefined,
			undefined,
		]);
		expect(rows[0]?.price?.commodity).toBe('INR');
	});

	it('count a holding once however many of its costs have no rate', () => {
		const noUsd = (c: string) => (c === 'USD' ? [null, null, null] : [10n, 10n, 10n]);
		const { rows } = closingsOf([held], {
			...options,
			lots: lots({ unpriced: new Set(['EUR']) }),
			ratesFor: noUsd,
		});

		expect(rows.map((r) => [r.cost, r.unpriced])).toEqual([
			[0n, 1],
			[0n, 1],
			[0n, 1],
		]);
	});

	it('name a holding whose cost had no rate, though its units are priced', () => {
		const noUsd = (c: string) => (c === 'USD' ? [null, null, null] : [10n, 10n, 10n]);
		const { unpriced } = closingsOf([held], { ...options, lots: lots(), ratesFor: noUsd });

		expect(unpriced).toEqual([held]);
	});

	it('name a holding whose lots were paid for with a commodity that had none', () => {
		const { unpriced } = closingsOf([held], {
			...options,
			lots: lots({ unpriced: new Set(['EUR']) }),
			ratesFor,
		});

		expect(unpriced).toEqual([held]);
	});

	it('leave a cost that came back to nothing out of the sum', () => {
		const closed = lots({ costs: { USD: { opening: units(2), gains: { '2026-01': units(-2) } } } });
		const noUsd = (c: string) => (c === 'USD' ? [null, null, null] : [10n, 10n, 10n]);
		const { rows } = closingsOf([held], { ...options, lots: closed, ratesFor: noUsd });

		expect(rows.map((r) => [r.cost, r.unpriced])).toEqual([
			[0n, 0],
			[0n, 0],
			[0n, 0],
		]);
	});
});

describe('holdings of openings and gains', () => {
	const names = { a: 'Assets:Bank', b: 'Assets:Broker' };

	it('join what an account held before and gained in each bucket, by name', () => {
		const held = holdingsOf(
			{
				openings: [{ accountId: 'a', commodity: 'INR', units: units(9) }],
				gains: [
					{ accountId: 'a', commodity: 'INR', bucket: '2026-01', units: units(1) },
					{ accountId: 'a', commodity: 'INR', bucket: '2026-02', units: units(2) },
				],
			},
			names,
		);

		expect(held).toEqual([
			{
				account: 'Assets:Bank',
				commodity: 'INR',
				opening: units(9),
				gains: { '2026-01': units(1), '2026-02': units(2) },
			},
		]);
	});

	it('keep a holding that only has an opening or only has gains', () => {
		const held = holdingsOf(
			{
				openings: [{ accountId: 'a', commodity: 'INR', units: units(0) }],
				gains: [{ accountId: 'b', commodity: 'FUND', bucket: '2026-01', units: units(3) }],
			},
			names,
		);

		expect(held.map((h) => [h.account, h.commodity, h.opening])).toEqual([
			['Assets:Bank', 'INR', units(0)],
			['Assets:Broker', 'FUND', units(0)],
		]);
	});
});
