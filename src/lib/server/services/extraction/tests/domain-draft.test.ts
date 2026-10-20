import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { parse, parseAmount, type Amount } from '#services/ledger/application/shared.ts';
import { describe, expect, it } from 'vitest';
import { categorised, draft, uncategorised } from '#services/extraction/domain/draft.ts';
import type { RupeeRecord } from '#services/extraction/domain/types.ts';

const config = defaultConfiguration.ledger;

const record = (description: string, amount: string, category: string | null = null) =>
	({
		location: { file: 'hdfc.csv', line: 2 },
		date: Temporal.PlainDate.from('2026-08-29'),
		amount: parseAmount(amount) as Amount,
		description,
		category,
		balance: null,
	}) satisfies RupeeRecord;

const at = (line: number, account: string, r: RupeeRecord) => ({
	...r,
	location: { file: 'hdfc.csv', line },
	account,
});

const counterparts = (content: string) =>
	parse(config, { key: 'imports/hdfc.rupee', content }).succeeded.map(
		(t) => t.postings[1]?.account,
	);

describe('categorising records', () => {
	const records = [
		record('a', '-1', 'Expenses:Food'),
		record('b', '-1', 'Shopping'),
		record('c', '-1'),
		record('d', '-1', ' Expenses:Eating   Out '),
	];

	it('leaves uncategorised those whose category names no ledger account', () => {
		expect(uncategorised(records).map((r) => r.description)).toEqual(['b', 'c']);
	});

	it("takes the account from the statement's own category, as one word", () => {
		expect(categorised(records).map((r) => [r.description, r.account])).toEqual([
			['a', 'Expenses:Food'],
			['d', 'Expenses:Eating-Out'],
		]);
	});
});

describe('drafting a ledger file', () => {
	it('names the file after the statement, under imports', () => {
		const drafted = draft({
			config,
			statement: { key: 'hdfc-aug.2026.csv', checksum: 'sha256:abc', originalChecksum: null },
			account: 'Assets:Bank',
			records: [],
			failed: [],
		});
		expect(drafted.key).toBe('imports/hdfc-aug.2026.rupee');
	});

	it("writes each record against its account, in the statement's order", () => {
		const drafted = draft({
			config,
			statement: { key: 'hdfc.csv', checksum: 'sha256:abc', originalChecksum: null },
			account: 'Assets:Bank',
			records: [
				at(3, 'Income:Salary', record('SALARY', '50000')),
				at(2, 'Expenses:Food', record('GROCER', '-250')),
			],
			failed: [],
		});
		expect(counterparts(drafted.content)).toEqual(['Expenses:Food', 'Income:Salary']);
	});

	it('writes a balanced transaction per record, on one header line, citing the statement and its checksum', () => {
		const drafted = draft({
			config,
			statement: { key: 'hdfc.csv', checksum: 'sha256:abc', originalChecksum: null },
			account: 'Assets:Bank',
			records: [at(2, 'Expenses:Shopping', record('UPI  SHOP\nBLR', '-120.50'))],
			failed: [],
		});
		const parsed = parse(config, { key: drafted.key, content: drafted.content });
		expect(parsed.failed).toEqual([]);
		expect(parsed.metadata).toEqual({ statement: ['hdfc.csv'], checksum: ['sha256:abc'] });
		expect(parsed.succeeded[0]?.description).toBe('UPI SHOP BLR');
		expect(parsed.succeeded[0]?.postings.map((p) => [p.account, p.amount])).toEqual([
			['Assets:Bank', parseAmount('-120.50')],
			['Expenses:Shopping', parseAmount('120.50')],
		]);
	});

	it('cites the upload too, when unlocking changed its content', () => {
		const drafted = draft({
			config,
			statement: { key: 'hdfc.pdf', checksum: 'sha256:abc', originalChecksum: 'sha256:def' },
			account: 'Assets:Bank',
			records: [],
			failed: [],
		});
		expect(parse(config, { key: drafted.key, content: drafted.content }).metadata).toEqual({
			statement: ['hdfc.pdf'],
			checksum: ['sha256:abc'],
			'original-checksum': ['sha256:def'],
		});
	});
});
