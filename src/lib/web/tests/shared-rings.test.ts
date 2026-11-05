import { describe, expect, it } from 'vitest';
import { ringsOf } from '#lib/web/shared/rings.ts';

const held = (account: string, parent: string | null, total: number) => ({
	account,
	parent,
	total: String(total),
});

const ACCOUNTS = [
	held('Assets', null, 95),
	held('Assets:Investments', 'Assets', 60),
	held('Assets:Investments:Gold', 'Assets:Investments', 40),
	held('Assets:Investments:Equity', 'Assets:Investments', 20),
	held('Assets:Bank', 'Assets', 30),
	held('Assets:Bank:HDFC', 'Assets:Bank', 20),
	held('Assets:Bank:ICICI', 'Assets:Bank', 10),
	held('Assets:Retirement', 'Assets', 10),
	held('Assets:Card', 'Assets', -5),
];

const at = (rings: ReturnType<typeof ringsOf>, level: number) =>
	rings.arcs
		.filter((a) => a.level === level)
		.map((a) => [a.key, a.part, +a.from.toFixed(2), +a.to.toFixed(2), a.own]);

describe('the rings an account divides into', () => {
	it('gives each level of accounts a ring, the largest first, and each account its parent’s arc to divide', () => {
		const rings = ringsOf(ACCOUNTS);

		expect(rings.levels).toBe(2);
		expect(at(rings, 1)).toEqual([
			['Assets:Investments', 0, 0, 0.6, true],
			['Assets:Bank', 1, 0.6, 0.9, true],
			['Assets:Retirement', 2, 0.9, 1, true],
		]);
		expect(at(rings, 2)).toEqual([
			['Assets:Investments:Gold', 0, 0, 0.4, true],
			['Assets:Investments:Equity', 0, 0.4, 0.6, true],
			['Assets:Bank:HDFC', 1, 0.6, 0.8, true],
			['Assets:Bank:ICICI', 1, 0.8, 0.9, true],
			['Assets:Retirement', 2, 0.9, 1, false],
		]);
	});

	it('leaves out an account that owes, counting it', () => {
		const rings = ringsOf(ACCOUNTS);

		expect(rings.skipped).toBe(1);
		expect(rings.arcs.some((a) => a.key === 'Assets:Card')).toBe(false);
		expect(rings.arcs.find((a) => a.key === 'Assets:Bank')?.share).toBeCloseTo(0.3);
	});

	it('keeps what an account holds beyond its sub-accounts as an arc of its own name', () => {
		const rings = ringsOf(
			ACCOUNTS.map((a) => (a.account === 'Assets:Bank' ? { ...a, total: '35' } : a)),
		);

		expect(at(rings, 2).filter((a) => a[0] === 'Assets:Bank')).toEqual([
			['Assets:Bank', 1, 0.86, 0.9, false],
		]);
	});

	it('carries an arc outward through rings it has no sub-accounts in', () => {
		const rings = ringsOf([
			...ACCOUNTS,
			held('Assets:Investments:Gold:Coins', 'Assets:Investments:Gold', 40),
		]);

		expect(rings.levels).toBe(3);
		expect(at(rings, 3).map((a) => a[0])).toEqual([
			'Assets:Investments:Gold:Coins',
			'Assets:Investments:Equity',
			'Assets:Bank:HDFC',
			'Assets:Bank:ICICI',
			'Assets:Retirement',
		]);
	});

	it('divides only the account asked for, whatever its case', () => {
		const rings = ringsOf(ACCOUNTS, 'assets:investments');

		expect(rings.levels).toBe(1);
		expect(at(rings, 1).map((a) => a[0])).toEqual([
			'Assets:Investments:Gold',
			'Assets:Investments:Equity',
		]);
	});

	it('draws nothing for an account that is unknown, empty or has no accounts under it', () => {
		expect(ringsOf(ACCOUNTS, 'Assets:Nowhere').arcs).toEqual([]);
		expect(ringsOf([held('Assets', null, 0), held('Assets:Bank', 'Assets', 0)]).arcs).toEqual([]);
		expect(ringsOf([held('Assets', null, 50)]).arcs).toEqual([]);
	});
});
