import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	BalanceQuery,
	groupsInvested,
	investedOf,
	nestedOf,
	totalsOf,
} from '#lib/web/shared/invested.ts';
import { type Amount, parseAmount } from '#lib/shared/amounts.ts';
const amount = (t: string) => parseAmount(t) as Amount;

const held = (account: string, total: string, cost: string | null, gain: string | null) => ({
	account,
	total: amount(total),
	cost: cost === null ? null : amount(cost),
	gain: gain === null ? null : amount(gain),
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

describe('nesting accounts', () => {
	it('puts each account before the ones under it and keeps sibling order', () => {
		const order = [
			'Assets:Equity',
			'Assets:Debt',
			'Assets:Equity:Stocks',
			'Assets:Debt:Bonds',
			'Assets:Equity:Funds',
		];
		const nested = nestedOf(order.map((account) => ({ account })));

		expect(nested.map((a) => a.account)).toEqual([
			'Assets:Equity',
			'Assets:Equity:Stocks',
			'Assets:Equity:Funds',
			'Assets:Debt',
			'Assets:Debt:Bonds',
		]);
	});

	it('keeps an account whose parent is not listed', () => {
		expect(nestedOf([{ account: 'Assets:Gold:Coins' }]).length).toBe(1);
	});
});

describe('BalanceQuery', () => {
	const read = (query: Record<string, string>) => v.parse(BalanceQuery('2026-11-11'), query);

	it('is this year with no account by default', () => {
		expect(read({})).toEqual({ account: null, period: { kind: 'year', at: '2026' } });
	});

	it('reads a period from the URL', () => {
		expect(read({ at: '2026-03' }).period).toEqual({ kind: 'month', at: '2026-03' });
	});

	it('reads an account under Assets', () => {
		expect(read({ account: ' Assets:Bank ' }).account).toBe('Assets:Bank');
	});

	it('falls back to no account outside Assets and Liabilities', () => {
		expect(read({ account: 'Expenses:Food' }).account).toBeNull();
	});

	it('is a schema readQuery accepts', () => {
		const schema: v.GenericSchema<Record<string, string | undefined>, unknown> = BalanceQuery(
			'2026-11-11',
		);
		expect(v.is(schema, {})).toBe(true);
	});
});
