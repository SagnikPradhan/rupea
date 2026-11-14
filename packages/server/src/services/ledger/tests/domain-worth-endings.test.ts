import { AMOUNT_UNIT, type Amount } from '#services/ledger/domain/amounts.ts';
import { NO_AMOUNT, writeSeries } from '#services/ledger/domain/series.ts';
import { AccountType } from '#services/ledger/domain/types.ts';
import {
	endingsOf,
	movesOf,
	shiftsOf,
	worthOf,
	worthOn,
	type BalanceYear,
	type PriceYear,
	type WorthOfOptions,
} from '#services/ledger/domain/worth.ts';
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

describe('worth on one day', () => {
	const worth = worthOf(options);

	it('is what worth gives for the first, a middle and the last day', () => {
		const days = [worth[0], worth[400], worth.at(-1)];

		expect(days.every((w) => w !== undefined)).toBe(true);
		expect(days.map((w) => w && worthOn(options, w.day))).toEqual(days);
	});
});

describe('shifts', () => {
	it('add up what movesOf gives for each part', () => {
		const moved = movesOf(options).map((m) => ({
			account: m.part,
			amount: m.after.reduce((t, a, i) => t + a - (m.before[i] ?? 0n), 0n),
		}));

		expect(moved.some((m) => m.amount !== 0n)).toBe(true);
		expect(shiftsOf(options)).toEqual(moved);
	});
});
