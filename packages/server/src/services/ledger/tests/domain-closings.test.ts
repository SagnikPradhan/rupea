import { AMOUNT_UNIT, type Amount } from '#services/ledger/domain/amounts.ts';
import {
	closesOf,
	closingsOf,
	daysOf,
	holdingsOf,
	seriesOf,
	type Holding,
} from '#services/ledger/domain/closings.ts';
import { lotKeyOf, type Lots } from '#services/ledger/domain/closings-lots.ts';
import { endsIn, type Measure } from '@rupea/shared/balances.ts';
import { describe, expect, it } from 'vitest';

const units = (n: number) => (BigInt(n) * AMOUNT_UNIT) as Amount;

const holding = (o: Partial<Holding>): Holding => ({
	account: 'Assets:Broker',
	commodity: 'FUND',
	opening: units(0),
	gains: {},
	...o,
});

const keys = ['2026-01', '2026-02', '2026-03'];
const measures: Measure[] = ['value', 'units', 'cost', 'paid', 'price'];

describe('closings', () => {
	const options = { base: 'INR', keys, measures };

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
		const { rows } = closingsOf([held], { ...options, ratesFor: () => keys.map(() => now) });

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

describe('closings of what is asked', () => {
	const held = holding({ opening: units(2) });
	const rates = [3n * AMOUNT_UNIT, null, 4n * AMOUNT_UNIT];
	const only = (m: Measure[]) =>
		closingsOf([held], { base: 'INR', keys, measures: m, ratesFor: () => rates });

	it('leave the value unworked when it is not asked, and still count the unpriced', () => {
		const { rows, unpriced } = only(['units', 'price']);

		expect(rows.map((r) => [r.units, r.value, r.unpriced])).toEqual([
			[units(2), 0n, 0],
			[units(2), 0n, 1],
			[units(2), 0n, 0],
		]);
		expect(unpriced).toEqual([held]);
	});

	it('share one price between days of a rate, and leave it out when it is not asked', () => {
		const flat = [AMOUNT_UNIT, AMOUNT_UNIT, null];
		const { rows } = closingsOf([held], {
			base: 'INR',
			keys,
			measures: ['price'],
			ratesFor: () => flat,
		});

		expect(rows[0]?.price).toEqual({ amount: AMOUNT_UNIT, commodity: 'INR' });
		expect(rows[1]?.price).toBe(rows[0]?.price);
		expect(rows[2]?.price).toBeNull();
		expect(only(['units']).rows.map((r) => r.price)).toEqual([null, null, null]);
	});
});

describe('the last day of each bucket', () => {
	const span = {
		from: Temporal.PlainDate.from('2024-02-27'),
		to: Temporal.PlainDate.from('2026-03-10'),
	};

	it('are every day by date, counted from the first', () => {
		const { keys: days, days: counted } = closesOf(
			{ from: span.from, to: Temporal.PlainDate.from('2024-03-02') },
			'date',
		);

		expect(days).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02']);
		expect(counted).toEqual([0, 1, 2, 3, 4]);
	});

	it('are each month’s last day, the last cut short, and a leap February’s 29th', () => {
		const { keys: months, days } = closesOf(span, 'month');

		expect(months).toHaveLength(26);
		expect(months.slice(0, 3)).toEqual(['2024-02', '2024-03', '2024-04']);
		expect(months.at(-1)).toBe('2026-03');
		expect(days.slice(0, 2)).toEqual([2, 33]);
		expect(days.at(-1)).toBe(span.from.until(span.to).days);
	});

	it('are each year’s last day, the last cut short', () => {
		const { keys: years, days } = closesOf(span, 'year');

		expect(years).toEqual(['2024', '2025', '2026']);
		expect(days).toEqual([
			span.from.until(Temporal.PlainDate.from('2024-12-31')).days,
			span.from.until(Temporal.PlainDate.from('2025-12-31')).days,
			span.from.until(span.to).days,
		]);
	});

	it('are the ones the shared ends name', () => {
		const { days } = closesOf(span, 'month');

		expect(days).toEqual(endsIn(span, 'month').map((d) => span.from.until(d).days));
	});
});

describe('closings of lots', () => {
	const options = { base: 'INR', keys, measures };
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

describe('series of every day', () => {
	const span = {
		from: Temporal.PlainDate.from('2026-01-01'),
		to: Temporal.PlainDate.from('2026-01-05'),
	};
	const held = holding({
		opening: units(5),
		gains: { '2026-01-02': units(2), '2026-01-04': units(-3) },
	});

	it('count every day of a span from its start', () => {
		expect(daysOf(span)).toEqual({ keys: [], days: [0, 1, 2, 3, 4] });
	});

	it('carry the units of each day as floats and share one price among the holdings of a commodity', () => {
		const other = holding({ account: 'Assets:Other', opening: units(1) });
		const rates = [10n, 10n, 20n, 20n, 30n].map((n) => n * AMOUNT_UNIT);
		const { series } = seriesOf([held, other], { base: 'INR', span, ratesFor: () => rates });

		expect(series[0]?.units).toEqual(Float64Array.from([5, 7, 7, 4, 4]));
		expect(series[0]?.prices).toEqual(Float64Array.from([10, 10, 20, 20, 30]));
		expect(series[1]?.units).toEqual(Float64Array.from([1, 1, 1, 1, 1]));
		expect(series[1]?.prices).toBe(series[0]?.prices);
	});

	it('price the base at one and leave a day with no rate as NaN', () => {
		const cash = holding({ commodity: 'INR', opening: units(3) });
		const { series } = seriesOf([cash, held], {
			base: 'INR',
			span,
			ratesFor: () => [null, null, 5n * AMOUNT_UNIT, null, 5n * AMOUNT_UNIT],
		});

		expect(series[0]?.prices).toEqual(Float64Array.from([1, 1, 1, 1, 1]));
		expect(series[1]?.prices.map((p) => (Number.isNaN(p) ? -1 : p))).toEqual(
			Float64Array.from([-1, -1, 5, -1, 5]),
		);
	});

	it('name the holdings that had units on a day with no rate, and no other', () => {
		const empty = holding({ commodity: 'GOLD', opening: units(0) });
		const rates = [null, 1n, 1n, 1n, 1n];
		const { unpriced } = seriesOf([held, empty], { base: 'INR', span, ratesFor: () => rates });

		expect(unpriced).toEqual([held]);
	});
});
