import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import { parse, parseAmount } from './parser';
import { print } from './printer';
import type { Amount, RupeeTransaction } from './types';

const amount = (t: string) => parseAmount(t) as Amount;

const transactions: RupeeTransaction[] = [
	{
		location: { file: 'a.rupee', line: 1 },
		date: Temporal.PlainDate.from('2026-08-29'),
		time: Temporal.PlainTime.from('18:45'),
		description: 'Groceries',
		postings: [
			{ account: 'Expenses:Food', amount: amount('100.5') },
			{ account: 'Assets:Bank', amount: amount('-100.5') },
		],
	},
	{
		location: { file: 'a.rupee', line: 5 },
		date: Temporal.PlainDate.from('2026-08-30'),
		time: null,
		description: 'Salary for August',
		postings: [
			{ account: 'Assets:Bank', amount: amount('-0.000001') },
			{ account: 'Income:Salary', amount: amount('0.000001') },
		],
	},
];

describe('printing a ledger', () => {
	it('writes .rupee text in the first configured formats', () => {
		expect(print(defaultConfiguration, transactions)).toBe(
			[
				'2026-08-29 18:45 Groceries',
				'\tExpenses:Food 100.50',
				'\tAssets:Bank',
				'',
				'2026-08-30 Salary for August',
				'\tAssets:Bank',
				'\tIncome:Salary 0.000001',
				'',
			].join('\n'),
		);
	});

	it('spells every amount unless exactly one posting is outgoing', () => {
		const spelled = (postings: [string, string][]) =>
			print(defaultConfiguration, [
				{
					...transactions[0]!,
					postings: postings.map(([account, a]) => ({ account, amount: amount(a) })),
				},
			])
				.split('\n')
				.slice(1, -1);
		expect(
			spelled([
				['A', '-1'],
				['B', '-2'],
				['C', '3'],
			]),
		).toEqual(['\tA -1.00', '\tB -2.00', '\tC 3.00']);
		expect(
			spelled([
				['A', '0'],
				['B', '0'],
			]),
		).toEqual(['\tA 0.00', '\tB 0.00']);
	});

	it('reads back as what it wrote', () => {
		const content = print(defaultConfiguration, transactions);
		expect(parse(defaultConfiguration, { key: 'a.rupee', content })).toEqual({
			succeeded: transactions,
			failed: [],
		});
	});

	it('follows the configuration', () => {
		const cfg = {
			...defaultConfiguration,
			dateFormats: ['d MMM yyyy'],
			timeFormats: ['h:mm a'],
		};
		expect(print(cfg, transactions.slice(0, 1))).toMatch(/^29 Aug 2026 6:45 PM Groceries\n/);
	});

	it('writes nothing for no transactions', () => {
		expect(print(defaultConfiguration, [])).toBe('');
	});
});
