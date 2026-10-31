import { AMOUNT_UNIT } from '#services/ledger/domain/amounts.ts';
import { writeSeries } from '#services/ledger/domain/series.ts';
import { AccountType } from '#services/ledger/domain/types.ts';
import { symbolsOf, worthOf, type BalanceYear } from '#services/ledger/domain/worth.ts';
import { describe, expect, it } from 'vitest';

const day = (d: string) => Temporal.PlainDate.from(d);
const NONE = { prices: [], sources: { own: [], links: [] }, opening: {}, byCommodity: false };
const PARTS = [{ accountId: 'bank', part: 'Assets:Bank' }];

const year = (y: number, daily: (i: number) => bigint): BalanceYear => {
	const days = Temporal.PlainDate.from({ year: y, month: 1, day: 1 }).daysInYear;

	return {
		accountId: 'bank',
		accountType: AccountType.Assets,
		commodity: 'INR',
		year: y,
		balances: writeSeries(Array.from({ length: days }, (_, i) => daily(i) * AMOUNT_UNIT)),
	};
};

describe('the symbols a read needs', () => {
	const sources = {
		own: [
			{ id: 'own-infy', symbol: 'INFY' },
			{ id: 'own-usd', symbol: 'USD' },
		],
		links: [
			{ alias: 'INFY', symbolId: 'feed-infy', since: null, until: null },
			{ alias: 'TCS', symbolId: 'feed-tcs', since: null, until: null },
		],
	};

	it('are only those pricing the commodities asked for', () => {
		expect(symbolsOf(sources, ['INFY']).toSorted()).toEqual(['feed-infy', 'own-infy']);
	});

	it('name a symbol two aliases share once', () => {
		const shared = {
			own: [],
			links: [
				{ alias: 'A', symbolId: 'feed', since: null, until: null },
				{ alias: 'B', symbolId: 'feed', since: null, until: null },
			],
		};

		expect(symbolsOf(shared, ['A', 'B'])).toEqual(['feed']);
	});
});

describe('worth from years', () => {
	it('carries a year’s last balance through years with no row', () => {
		const worth = worthOf({
			...NONE,
			from: day('2021-12-31'),
			to: day('2024-01-02'),
			parts: PARTS,
			balances: [year(2021, () => 5n), year(2024, () => 9n)],
		});
		const on = (d: string) => worth.find((w) => w.day.toString() === d)?.worth;

		expect(on('2021-12-31')).toBe(5n * AMOUNT_UNIT);
		expect(on('2022-07-01')).toBe(5n * AMOUNT_UNIT);
		expect(on('2023-12-31')).toBe(5n * AMOUNT_UNIT);
		expect(on('2024-01-01')).toBe(9n * AMOUNT_UNIT);
	});

	it('opens a span from the last row before it', () => {
		const worth = worthOf({
			...NONE,
			from: day('2023-03-01'),
			to: day('2023-03-02'),
			parts: PARTS,
			balances: [year(2020, () => 7n)],
		});

		expect(worth.map((w) => w.worth)).toEqual([7n * AMOUNT_UNIT, 7n * AMOUNT_UNIT]);
	});

	it('shows every day up to a thousand', () => {
		const from = day('2020-01-01');
		const to = from.add({ days: 999 });
		const balances = [2020, 2021, 2022].map((y) => year(y, () => 1n));

		expect(worthOf({ ...NONE, from, to, parts: PARTS, balances })).toHaveLength(1000);
	});

	describe('over a long span', () => {
		const from = day('2000-01-01');
		const to = day('2019-12-31');
		const dip = 2010;
		const spike = 2015;
		const balances = Array.from({ length: 20 }, (_, n) =>
			year(2000 + n, (i) => {
				if (2000 + n === dip && i === 100) return -50n;
				if (2000 + n === spike && i === 200) return 900n;
				return 10n;
			}),
		);
		const worth = worthOf({ ...NONE, from, to, parts: PARTS, balances });

		it('keeps a dip and a spike of a single day', () => {
			const values = worth.map((w) => w.worth);

			expect(Math.min(...values.map(Number))).toBe(Number(-50n * AMOUNT_UNIT));
			expect(Math.max(...values.map(Number))).toBe(Number(900n * AMOUNT_UNIT));
		});

		it('keeps the first and last days, in order, with far fewer points', () => {
			const days = worth.map((w) => w.day.toString());

			expect(days[0]).toBe('2000-01-01');
			expect(days.at(-1)).toBe('2019-12-31');
			expect(days).toEqual(days.toSorted());
			expect(days.length).toBeLessThanOrEqual(1002);
		});
	});

	it('counts a commodity with no price as unpriced, leaving it out of worth', () => {
		const held = { ...year(2023, () => 3n), commodity: 'TCS' };
		const worth = worthOf({
			...NONE,
			from: day('2023-01-01'),
			to: day('2023-01-01'),
			parts: PARTS,
			balances: [held],
		});

		expect(worth[0]).toMatchObject({ worth: 0n, unpriced: 1, parts: [] });
	});
});
