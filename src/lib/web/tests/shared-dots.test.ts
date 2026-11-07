import { describe, expect, it } from 'vitest';
import { dotsOf } from '#lib/web/shared/dots.ts';
import { ringsOf } from '#lib/web/shared/rings.ts';

const held = (account: string, parent: string | null, total: number) => ({
	account,
	parent,
	total: String(total),
});

const RINGS = ringsOf([
	held('Assets', null, 100),
	held('Assets:Investments', 'Assets', 60),
	held('Assets:Investments:Gold', 'Assets:Investments', 60),
	held('Assets:Retirement', 'Assets', 40),
]);

const grown = (account: string, value: number, xirr: number | null) => ({ account, value, xirr });

describe('the dots of the return and risk chart', () => {
	it('places an account by its swing and its return, sized by what it holds', () => {
		const dots = dotsOf(
			[grown('Assets:Investments:Gold', 60, 0.12)],
			[{ account: 'Assets:Investments:Gold', swing: 0.15 }],
			RINGS.arcs,
		);

		expect(dots).toEqual([
			{ key: 'Assets:Investments:Gold', label: 'Gold', across: 0.15, up: 0.12, size: 60, part: 0 },
		]);
	});

	it('colours an account as the group it sits in is coloured in the rings', () => {
		const dots = dotsOf(
			[grown('Assets:Investments:Gold', 60, 0.1), grown('Assets:Retirement', 40, 0.05)],
			[
				{ account: 'Assets:Investments:Gold', swing: 0.1 },
				{ account: 'Assets:Retirement', swing: 0.02 },
			],
			RINGS.arcs,
		);

		expect(dots.map((d) => d.part)).toEqual([0, 1]);
	});

	it('leaves out an account with no swing, no return, or nothing in it', () => {
		const dots = dotsOf(
			[
				grown('Assets:Investments:Gold', 60, 0.1),
				grown('Assets:Retirement', 40, null),
				grown('Assets:Bank', 0, 0.1),
			],
			[
				{ account: 'Assets:Retirement', swing: 0.02 },
				{ account: 'Assets:Bank', swing: 0.02 },
			],
			RINGS.arcs,
		);

		expect(dots).toEqual([]);
	});

	it('finds the group of an account whatever the case of its name', () => {
		const dots = dotsOf(
			[grown('assets:retirement:epf', 40, 0.05)],
			[{ account: 'assets:retirement:epf', swing: 0.02 }],
			RINGS.arcs,
		);

		expect(dots[0]?.part).toBe(RINGS.arcs.find((a) => a.key === 'Assets:Retirement')?.part);
	});
});
