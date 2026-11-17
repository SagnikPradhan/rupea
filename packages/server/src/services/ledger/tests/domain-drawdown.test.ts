import { dropsOf } from '#services/ledger/domain/drawdown.ts';
import { describe, expect, it } from 'vitest';

const FIRST = Temporal.PlainDate.from('2026-01-01');

type Held = {
	account: string;
	commodity: string;
	units: number[];
	prices: (number | null)[];
};

const dailyOf = (held: Held[]) => {
	const days = held[0]?.units.length ?? 0;
	const series = held.map((h) => ({
		account: h.account,
		commodity: h.commodity,
		units: Float64Array.from({ length: days }, (_, i) => h.units[i] ?? 0),
		prices: Float64Array.from({ length: days }, (_, i) => h.prices[i] ?? Number.NaN),
	}));

	return { from: FIRST, to: FIRST.add({ days: days - 1 }), base: 'INR', rows: [], series };
};

const infy = (units: number[], prices: (number | null)[]): Held => ({
	account: 'Assets:Zerodha',
	commodity: 'INFY',
	units,
	prices,
});

const lotted = (held: Held[]) => held.map((h) => ({ name: h.account, commodity: h.commodity }));

describe('drops of daily balances', () => {
	it('counts what prices did to the units held the day before, and neither buying nor selling', () => {
		const held = [infy([10, 10, 20, 20, 5], [100, 80, 80, 90, 90])];

		const drops = dropsOf(dailyOf(held), lotted(held));
		const depths = drops?.underwater.map((u) => u.depth);

		expect(depths?.[0]).toBe(0);
		expect(depths?.[1]).toBeCloseTo(-0.2);
		expect(depths?.[2]).toBeCloseTo(-0.2);
		expect(depths?.[3]).toBeCloseTo(-0.1);
		expect(depths?.[4]).toBeCloseTo(-0.1);
		expect(drops?.lows).toEqual([
			{ account: 'Assets:Zerodha', depth: depths?.[1], day: FIRST.add({ days: 1 }) },
		]);
	});

	it('counts only the holdings it is told had lots', () => {
		const held = [
			infy([10, 10, 10], [100, 50, 50]),
			{ ...infy([5, 5, 5], [10, 20, 40]), commodity: 'GOLD' },
			{ ...infy([1, 1, 1], [10, 5, 1]), account: 'Assets:Other' },
		];

		const drops = dropsOf(dailyOf(held), lotted(held.slice(0, 1)));

		expect(drops?.lows.map((l) => [l.account, l.depth])).toEqual([['Assets:Zerodha', -0.5]]);
		expect(drops?.underwater.map((u) => u.depth)).toEqual([0, -0.5, -0.5]);
	});

	it('values each account apart, worst low first', () => {
		const other = {
			...infy([1, 1, 1], [100, 90, 100]),
			account: 'Assets:Other',
			commodity: 'TCS',
		};
		const held = [infy([10, 10, 10], [100, 50, 60]), other];

		const lows = dropsOf(dailyOf(held), lotted(held))?.lows.map((l) => [l.account, l.depth]);

		expect(lows?.[0]).toEqual(['Assets:Zerodha', -0.5]);
		expect(lows?.[1]?.[0]).toBe('Assets:Other');
		expect(lows?.[1]?.[1]).toBeCloseTo(-0.1);
	});

	it('counts a day with no price on it or the day before on neither, and none that fell', () => {
		const held = [infy([10, 10, 10, 10], [100, null, 50, 50])];

		const drops = dropsOf(dailyOf(held), lotted(held));

		expect(drops?.underwater.map((u) => u.depth)).toEqual([0, 0, 0, 0]);
		expect(drops?.lows.map((l) => l.depth)).toEqual([0]);
	});

	it('starts on the first day a holding with lots was held', () => {
		const held = [infy([0, 0, 10, 10], [100, 100, 100, 50])];

		const drops = dropsOf(dailyOf(held), lotted(held));

		expect(drops?.underwater.map((u) => [`${u.day}`, u.depth])).toEqual([
			['2026-01-03', 0],
			['2026-01-04', -0.5],
		]);
	});

	it('has nothing when no holding had lots or none was held', () => {
		const held = [infy([10, 10], [100, 50])];

		expect(dropsOf(dailyOf(held), [])).toBeNull();
		expect(dropsOf(dailyOf([infy([0, 0], [100, 50])]), lotted(held))).toBeNull();
	});

	it('keeps each stretch’s lowest and highest day of a long span, and the first and last', () => {
		const length = 3000;
		const units = Array.from({ length }, () => 1);
		const prices = Array.from({ length }, (_, i) => 100 + (i % 7));
		const held = [infy(units, prices)];

		const drops = dropsOf(dailyOf(held), lotted(held));
		const days = drops?.underwater.map((u) => `${u.day}`);

		expect(days?.length).toBeLessThan(1100);
		expect(days?.[0]).toBe('2026-01-01');
		expect(days?.at(-1)).toBe(`${FIRST.add({ days: length - 1 })}`);
	});

	it('puts the low on the first day of a flat stretch', () => {
		const held = [infy([1, 1, 1, 1, 1, 1], [100, 50, 50, 50, 70, 70])];

		const low = dropsOf(dailyOf(held), lotted(held))?.lows[0];

		expect(low).toEqual({ account: 'Assets:Zerodha', depth: -0.5, day: FIRST.add({ days: 1 }) });
	});

	it('puts the low on the first of the days within float noise of the lowest', () => {
		const prices = [300, 230, 300, 230, 300, 230];
		const held = [infy([1, 1, 1, 1, 1, 1], prices)];

		const drops = dropsOf(dailyOf(held), lotted(held));
		const depths = drops?.underwater.map((u) => u.depth) ?? [];

		expect(depths[3]).toBeLessThan(depths[1] ?? 0);
		expect(depths[1]).toBeCloseTo(depths[3] ?? 0, 12);
		expect(drops?.lows[0]?.day).toEqual(FIRST.add({ days: 1 }));
	});

	it('says the swing of an account that moved on enough days, and not of one that did not', () => {
		const length = 130;
		const moving = Array.from({ length }, (_, i) => 100 + (i % 2 ? 5 : 0) + i / 10);
		const still = Array.from({ length }, (_, i) => (i < 20 ? 100 + i : 120));
		const held = [
			infy(
				Array.from({ length }, () => 1),
				moving,
			),
			{
				...infy(
					Array.from({ length }, () => 1),
					still,
				),
				account: 'Assets:Other',
				commodity: 'TCS',
			},
		];

		const swings = dropsOf(dailyOf(held), lotted(held))?.swings;

		expect(swings?.map((s) => s.account)).toEqual(['Assets:Zerodha']);
		expect(swings?.[0]?.swing).toBeGreaterThan(0.5);
	});
});
