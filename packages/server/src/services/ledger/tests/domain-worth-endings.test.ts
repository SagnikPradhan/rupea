import {
	AMOUNT_UNIT,
	multiply,
	type Amount,
	type Quantity,
} from '#services/ledger/domain/amounts.ts';
import { NO_AMOUNT, writeSeries } from '#services/ledger/domain/series.ts';
import { AccountType } from '#services/ledger/domain/types.ts';
import { ratesOn, type PriceSources, type PriceYear } from '#services/ledger/domain/worth.ts';
import { endingsOf, worthOf, type BalanceYear, type WorthOfOptions } from './fixtures/worth-oracle';
import { describe, expect, it } from 'vitest';

const day = (d: string) => Temporal.PlainDate.from(d);
const units = (n: number) => BigInt(Math.round(n * 100)) * (AMOUNT_UNIT / 100n);

const balances = (
	accountId: string,
	commodity: string,
	{ year, length, at }: { year: number; length: number; at: (i: number) => number },
): BalanceYear => ({
	accountId,
	accountType: AccountType.Assets,
	commodity,
	year,
	balances: writeSeries(Array.from({ length }, (_, i) => units(at(i)))),
});

const quotes = (
	symbolId: string,
	priceCommodity: string,
	{ year, at }: { year: number; at: (i: number) => number | null },
): PriceYear => ({
	symbolId,
	priceCommodity,
	year,
	amounts: writeSeries(
		Array.from(
			{ length: Temporal.PlainDate.from({ year, month: 1, day: 1 }).daysInYear },
			(_, i) => {
				const price = at(i);
				return price === null ? NO_AMOUNT : units(price);
			},
		),
	),
});

const options: WorthOfOptions = {
	from: day('2021-06-01'),
	to: day('2023-03-31'),
	parts: [
		{ accountId: 'broker', part: 'Assets:Broker' },
		{ accountId: 'second', part: 'Assets:Broker' },
		{ accountId: 'bank', part: 'Assets:Bank' },
	],
	byCommodity: true,
	balances: [
		balances('broker', 'FUND', { year: 2021, length: 365, at: (i) => 10 + (i % 7) }),
		balances('broker', 'FUND', { year: 2023, length: 90, at: (i) => 20 + i }),
		balances('second', 'FUND', { year: 2021, length: 100, at: (i) => 1 + i / 3 }),
		balances('bank', 'INR', { year: 2021, length: 365, at: (i) => 1000 + i }),
		balances('bank', 'GHOST', { year: 2022, length: 365, at: () => 4 }),
		balances('bank', 'BOND', { year: 2021, length: 365, at: (i) => 5 + (i > 200 ? 3 : 0) }),
	],
	prices: [
		quotes('own-fund', 'USD', { year: 2021, at: (i) => (i % 3 === 0 ? 11.1 + i / 50 : null) }),
		quotes('own-fund', 'USD', { year: 2022, at: (i) => (i % 5 === 0 ? 14.3 + i / 70 : null) }),
		quotes('feed-fund', 'USD', { year: 2021, at: (i) => 12.5 + i / 90 }),
		quotes('feed-fund', 'USD', { year: 2022, at: (i) => 15.25 + i / 80 }),
		quotes('own-usd', 'INR', { year: 2021, at: (i) => (i % 2 === 0 ? 74.5 + i / 40 : null) }),
		quotes('own-bond', 'INR', { year: 2022, at: (i) => 100 + i }),
		quotes('own-usd', 'INR', { year: 2023, at: (i) => (i % 4 === 0 ? 82.75 + i / 30 : null) }),
	],
	sources: {
		own: [
			{ id: 'own-fund', symbol: 'FUND' },
			{ id: 'own-usd', symbol: 'USD' },
			{ id: 'own-bond', symbol: 'BOND' },
		],
		links: [{ alias: 'FUND', symbolId: 'feed-fund', since: '2021-09-01', until: '2022-03-01' }],
	},
	opening: {
		FUND: { amount: units(11) as Amount, commodity: 'USD' },
		USD: { amount: units(73.25) as Amount, commodity: 'INR' },
	},
};

describe('endings on every day', () => {
	const days = Array.from({ length: options.from.until(options.to).days + 1 }, (_, i) =>
		options.from.add({ days: i }),
	);
	const endings = endingsOf(options, { days, lots: [], bought: [], paid: false });
	const worth = worthOf(options);

	it('are worth what worth gives for each part and commodity on the day', () => {
		const pricedEndings = endings
			.filter((e) => e.value !== null && e.value !== 0n)
			.map((e) => `${e.day} ${e.account} ${e.commodity} ${e.value}`);
		const pricedWorth = worth.flatMap((w) =>
			w.parts.map((p) => `${w.day} ${p.account} ${p.commodity} ${p.amount}`),
		);

		expect(pricedEndings.length).toBeGreaterThan(1000);
		expect(pricedEndings.toSorted()).toEqual(pricedWorth.toSorted());
	});

	it('leave a held commodity with no price without a value', () => {
		const ghosts = endings.filter((e) => e.commodity === 'GHOST' && e.units !== 0n);

		expect(ghosts.length).toBeGreaterThan(0);
		expect(ghosts.every((e) => e.value === null)).toBe(true);
	});

	it('carry a year’s last balance through the year its row runs out and the gap after', () => {
		const held = (d: string) =>
			endings.find((e) => e.commodity === 'FUND' && e.day.toString() === d);

		expect(held('2021-06-01')?.units).toBeGreaterThan(0n);
		expect(held('2022-07-01')?.units).toBe(held('2021-12-31')?.units);
		expect(held('2023-03-31')?.units).toBe(units(20 + 89) + units(1 + 99 / 3));
	});
});

describe('rates at days', () => {
	const days = Array.from({ length: options.from.until(options.to).days + 1 }, (_, i) =>
		options.from.add({ days: i }),
	);
	const every = days.map((_, i) => i);
	const endings = endingsOf(options, { days, lots: [], bought: [], paid: false });
	const priceOn = (commodity: string, d: Temporal.PlainDate) =>
		endings.find((e) => e.commodity === commodity && e.day.equals(d))?.price?.amount ?? null;

	it('are what endingsOf prices a commodity at on every day, null with none', () => {
		const rates = ratesOn(options, every);

		for (const commodity of ['FUND', 'BOND', 'GHOST'])
			expect(rates(commodity)).toEqual(days.map((d) => priceOn(commodity, d)));
		expect(rates('BOND').some((r) => r === null)).toBe(true);
		expect(rates('BOND').some((r) => r !== null)).toBe(true);
		expect(rates('GHOST').every((r) => r === null)).toBe(true);
	});

	it('are the same on a few days as on all of them', () => {
		const few = [3, 200, 330, 500, every.length - 1];
		const rates = ratesOn(options, few);

		expect(few).toHaveLength(5);
		for (const commodity of ['FUND', 'BOND'])
			expect(rates(commodity)).toEqual(few.map((i) => priceOn(commodity, days[i] ?? options.to)));
	});

	it('value every bucket at one day when that day is given for each', () => {
		const last = every.length - 1;
		const rates = ratesOn(options, [last, last, last]);

		expect(new Set(rates('FUND')).size).toBe(1);
		expect(rates('FUND')[0]).toBe(priceOn('FUND', options.to));
	});
});

describe('exact rates on every day', () => {
	const from = day('2024-01-01');
	const to = day('2024-01-10');
	const all = Array.from({ length: 10 }, (_, i) => i);
	const big = 2n ** 70n + 12_345n;
	const row = (
		symbolId: string,
		priceCommodity: string,
		amounts: (bigint | null)[],
	): PriceYear => ({
		symbolId,
		priceCommodity,
		year: 2024,
		amounts: writeSeries(Array.from({ length: 366 }, (_, i) => amounts[i] ?? NO_AMOUNT)),
	});
	const read = (o: {
		prices?: PriceYear[];
		sources?: PriceSources;
		opening?: Record<string, Quantity>;
	}) => ratesOn({ from, to, prices: [], sources: { own: [], links: [] }, opening: {}, ...o }, all);

	it('keep amounts wider than a machine word, and round a hop as multiply does', () => {
		const rates = read({
			prices: [row('a', 'USD', [units(2)]), row('u', 'INR', [big])],
			sources: {
				own: [
					{ id: 'a', symbol: 'ACME' },
					{ id: 'u', symbol: 'USD' },
				],
				links: [],
			},
		});

		expect(rates('USD')[0]).toBe(big);
		expect(rates('ACME')[0]).toBe(multiply(units(2) as Amount, big as Amount));
		expect(rates('ACME')[9]).toBe(rates('ACME')[0]);
	});

	it('carry the latest quote over gaps, and the opening price before the first', () => {
		const rates = read({
			prices: [row('a', 'INR', [null, null, units(5), null, units(7)])],
			sources: { own: [{ id: 'a', symbol: 'ACME' }], links: [] },
			opening: { ACME: { amount: units(4) as Amount, commodity: 'INR' } },
		});

		expect(rates('ACME').map((r) => r && r / AMOUNT_UNIT)).toEqual([
			4n,
			4n,
			5n,
			5n,
			7n,
			7n,
			7n,
			7n,
			7n,
			7n,
		]);
	});

	it('hold a link only between its days, from the start and for good when open', () => {
		const sources = {
			own: [],
			links: [
				{ alias: 'ACME', symbolId: 'early', since: '-infinity', until: '2024-01-04' },
				{ alias: 'ACME', symbolId: 'late', since: '2024-01-04', until: null },
				{ alias: 'OPEN', symbolId: 'early', since: null, until: 'infinity' },
			],
		};
		const rates = read({
			prices: [
				row('early', 'INR', [1, 2, 3, 4, 5].map(units)),
				row('late', 'INR', [null, null, null, units(50), units(60)]),
			],
			sources,
		});

		expect(rates('ACME').map((r) => r && r / AMOUNT_UNIT)).toEqual([
			1n,
			2n,
			3n,
			50n,
			60n,
			60n,
			60n,
			60n,
			60n,
			60n,
		]);
		expect(rates('OPEN').map((r) => r && r / AMOUNT_UNIT)).toEqual([
			1n,
			2n,
			3n,
			4n,
			5n,
			5n,
			5n,
			5n,
			5n,
			5n,
		]);
	});

	it('reach rupees in two hops and no more', () => {
		const rates = read({
			prices: [row('a', 'B', [units(2)]), row('b', 'C', [units(3)]), row('c', 'INR', [units(5)])],
			sources: {
				own: [
					{ id: 'a', symbol: 'A' },
					{ id: 'b', symbol: 'B' },
					{ id: 'c', symbol: 'C' },
				],
				links: [],
			},
		});

		expect(rates('C')[0]).toBe(units(5));
		expect(rates('B')[0]).toBe(units(15));
		expect(rates('A')[0]).toBeNull();
	});
});
