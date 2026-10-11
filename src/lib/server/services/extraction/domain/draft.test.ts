import { describe, expect, it } from 'vitest';
import { defaultConfiguration as config } from '#lib/server/shared/config.ts';
import { parse, parseAmount, type Amount } from '#services/ledger/application/shared.ts';
import { draft, uncategorised } from './draft';
import type { RupeeRecord } from './types';

const record = (description: string, amount: string, category: string | null = null) =>
	({
		location: { file: 'hdfc.csv', line: 2 },
		date: Temporal.PlainDate.from('2026-08-29'),
		amount: parseAmount(amount) as Amount,
		description,
		category,
		balance: null,
	}) satisfies RupeeRecord;

const predicted = (account: string) => ({ account, score: 0.9, source: 'history' as const });

const counterparts = (content: string) =>
	parse(config, { key: 'imports/hdfc.rupee', content }).succeeded.map(
		(t) => t.postings[1]?.account,
	);

describe('uncategorised records', () => {
	it('are those whose category names no ledger account', () => {
		const records = [
			record('a', '-1', 'Expenses:Food'),
			record('b', '-1', 'Shopping'),
			record('c', '-1'),
		];
		expect(uncategorised(records).map((r) => r.description)).toEqual(['b', 'c']);
	});
});

describe('drafting a ledger file', () => {
	it('names the file after the statement, under imports', () => {
		const drafted = draft({
			config,
			statement: 'hdfc-aug.2026.csv',
			account: 'Assets:Bank',
			records: [],
			predictions: [],
			failed: [],
		});
		expect(drafted.key).toBe('imports/hdfc-aug.2026.rupee');
	});

	it("prefers the statement's own category, then the prediction, then a fallback", () => {
		const records = [
			record('GROCER', '-250', 'Expenses:Food'),
			record('SALARY', '50000'),
			record('MYSTERY', '-10'),
			record('REFUND', '10'),
		];
		const drafted = draft({
			config,
			statement: 'hdfc.csv',
			account: 'Assets:Bank',
			records,
			predictions: [predicted('Income:Salary')],
			failed: [],
		});
		expect(counterparts(drafted.content)).toEqual([
			'Expenses:Food',
			'Income:Salary',
			'Expenses:Uncategorized',
			'Income:Uncategorized',
		]);
	});

	it('turns a spaced category into one account word', () => {
		const drafted = draft({
			config,
			statement: 'hdfc.csv',
			account: 'Assets:Bank',
			records: [record('CAFE', '-80', ' Expenses:Eating   Out ')],
			predictions: [],
			failed: [],
		});
		expect(counterparts(drafted.content)).toEqual(['Expenses:Eating-Out']);
	});

	it('writes a balanced transaction per record, on one header line, citing the statement', () => {
		const drafted = draft({
			config,
			statement: 'hdfc.csv',
			account: 'Assets:Bank',
			records: [record('UPI  SHOP\nBLR', '-120.50')],
			predictions: [predicted('Expenses:Shopping')],
			failed: [],
		});
		const parsed = parse(config, { key: drafted.key, content: drafted.content });
		expect(parsed.failed).toEqual([]);
		expect(parsed.metadata).toEqual({ statement: ['hdfc.csv'] });
		expect(parsed.succeeded[0]?.description).toBe('UPI SHOP BLR');
		expect(parsed.succeeded[0]?.postings.map((p) => [p.account, p.amount])).toEqual([
			['Assets:Bank', parseAmount('-120.50')],
			['Expenses:Shopping', parseAmount('120.50')],
		]);
	});
});
