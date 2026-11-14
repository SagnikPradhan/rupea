import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { flowsOf, type Moved } from '#services/ledger/domain/flows.ts';
import { dayNumberOf } from '#services/ledger/domain/returns.ts';
import { describe, expect, it } from 'vitest';

const DAY = dayNumberOf('2025-01-01');

const amount = (text: string) => parseAmount(text) ?? (0n as Amount);

const posting = (p: Partial<Moved> & { account: string }): Moved => ({
	transactionId: 't1',
	position: 0,
	date: '2025-01-01',
	amount: amount('0'),
	unpriced: 0,
	earned: false,
	held: false,
	...p,
});

const summary = (moved: Moved[]) =>
	flowsOf(moved).map((f) => [f.account, f.day, f.amount, f.unpriced]);

describe('flowsOf', () => {
	it('gives nothing for a transaction whose earning posting has no Assets one beside it', () => {
		expect(
			summary([posting({ account: 'Income:Cashback', amount: amount('-5'), earned: true })]),
		).toEqual([]);
	});

	it('takes interest out of what flowed into the account that received it', () => {
		expect(
			summary([
				posting({ account: 'Assets:Bank', amount: amount('100') }),
				posting({ account: 'Income:Interest', amount: amount('-100'), earned: true, position: 1 }),
			]),
		).toEqual([['Assets:Bank', DAY, 0n, 0]]);
	});

	it('shares income between what is held other than the base, the first taking the rest', () => {
		expect(
			summary([
				posting({ account: 'Assets:A', amount: amount('10'), held: true }),
				posting({ account: 'Assets:B', amount: amount('10'), held: true, position: 1 }),
				posting({ account: 'Assets:Bank', amount: amount('1'), position: 2 }),
				posting({
					account: 'Income:Dividends',
					amount: amount('-0.0000000003'),
					earned: true,
					position: 3,
				}),
			]),
		).toEqual([
			['Assets:A', DAY, amount('10') - 2n, 0],
			['Assets:B', DAY, amount('10') - 1n, 0],
			['Assets:Bank', DAY, amount('1'), 0],
		]);
	});

	it('leaves a posting unpriced when its share cannot be known', () => {
		expect(
			summary([
				posting({ account: 'Assets:Bank', amount: amount('5') }),
				posting({ account: 'Income:Interest', amount: null, earned: true, position: 1 }),
			]),
		).toEqual([['Assets:Bank', DAY, 0n, 1]]);
	});

	it('adds a transaction’s flows to what came added up for the same account and day', () => {
		expect(
			summary([
				posting({ account: 'Assets:Bank', transactionId: null, amount: amount('50'), unpriced: 1 }),
				posting({ account: 'Assets:Bank', amount: amount('100') }),
				posting({ account: 'Income:Interest', amount: amount('-30'), earned: true, position: 1 }),
			]),
		).toEqual([['Assets:Bank', DAY, amount('120'), 1]]);
	});
});
