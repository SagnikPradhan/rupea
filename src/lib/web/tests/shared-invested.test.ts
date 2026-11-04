import { describe, expect, it } from 'vitest';
import { groupsInvested, investedOf, totalsOf } from '#lib/web/shared/invested.ts';

const held = (account: string, total: string, cost: string | null, gain: string | null) => ({
	account,
	total,
	cost,
	gain,
});

const accounts = [
	held('Assets', '300', '200', '100'),
	held('Assets:Bank', '100', null, null),
	held('Assets:Investments', '200', '150', '50'),
	held('Assets:Investments:Gold', '120', '100', '20'),
	held('Liabilities:Loan', '-50', '60', '0'),
];

describe('the invested accounts', () => {
	it('are the ones under Assets with a cost, the largest first', () => {
		const names = investedOf(accounts, {}).map((a) => a.name);

		expect(names).toEqual(['Investments', 'Gold']);
	});

	it('carry what went in and how fast they grew from their returns', () => {
		const [first] = investedOf(accounts, { 'Assets:Investments': { netIn: '30', xirr: 0.14 } });

		expect(first).toMatchObject({ value: 200, cost: 150, gain: 50, netIn: 30, xirr: 0.14 });
	});

	it('are worth their cost, with nothing put in, until they have a gain and returns', () => {
		const [fresh] = investedOf([held('Assets:Gold', '100', '100', null)], {});

		expect(fresh).toMatchObject({ value: 100, gain: 0, netIn: 0, xirr: null });
	});

	it('count a group once, not again through its accounts', () => {
		const groups = groupsInvested(investedOf(accounts, {}));

		expect(totalsOf(groups)).toEqual({ value: 200, cost: 150, gain: 50, netIn: 0, xirr: null });
	});

	it('are worth only what their costed holdings are, not the cash beside them', () => {
		const [broker] = investedOf([held('Assets:Broker', '150', '80', '20')], {});

		expect(broker?.value).toBe(100);
	});

	it('return a year what their groups do, weighted by what each is worth', () => {
		const groups = [
			held('Assets:Stocks', '100', '50', '50'),
			held('Assets:Funds', '300', '250', '50'),
		];
		const returns = {
			'Assets:Stocks': { netIn: '0', xirr: 0.4 },
			'Assets:Funds': { netIn: '0', xirr: 0.08 },
		};

		expect(totalsOf(investedOf(groups, returns)).xirr).toBeCloseTo(0.16);
	});
});
