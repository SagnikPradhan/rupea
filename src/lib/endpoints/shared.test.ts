import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { parseAmount } from '#services/ledger/domain/parser.ts';
import { PriceKind, type Amount, type RupeeTransaction } from '#services/ledger/domain/types.ts';
import { Account, Key, SchemaKey, viewTransaction } from './shared';

const amount = (t: string) => parseAmount(t) as Amount;

const issues = (schema: v.GenericSchema, input: unknown) =>
	v.safeParse(schema, input).issues?.map((i) => i.message) ?? [];

describe('ledger file keys', () => {
	it.each(['a.rupee', 'bank/2026/hdfc.rupee'])('accepts %j', (key) => {
		expect(v.parse(Key, key)).toBe(key);
	});

	it.each(['', 'notes.txt', 'a.rupee.bak'])('rejects %j', (key) => {
		expect(v.safeParse(Key, key).success).toBe(false);
	});
});

describe('schema keys', () => {
	it('trims what was typed', () => {
		expect(v.parse(SchemaKey, '  hdfc.yml ')).toBe('hdfc.yml');
	});

	it.each(['', '   ', 'hdfc.yaml'])('rejects %j', (key) => {
		expect(v.safeParse(SchemaKey, key).success).toBe(false);
	});
});

describe('accounts', () => {
	it('trims what was typed', () => {
		expect(v.parse(Account, ' Assets:Bank:HDFC ')).toBe('Assets:Bank:HDFC');
	});

	it.each(['Assets', 'Liabilities:Card', 'Income:Salary', 'Expenses:Food', 'Equity:Opening'])(
		'accepts %j',
		(account) => {
			expect(v.safeParse(Account, account).success).toBe(true);
		},
	);

	it('asks for one word', () => {
		expect(issues(Account, 'Assets:My Bank')).toContain(
			'An account is one word, like Assets:Bank.',
		);
	});

	it('names the roots an account can start with', () => {
		expect(issues(Account, 'Bank:HDFC')).toEqual([
			'An account starts with one of Assets, Liabilities, Income, Expenses, Equity.',
		]);
	});

	it('takes the root as written, not lowercased', () => {
		expect(v.safeParse(Account, 'assets:bank').success).toBe(false);
	});
});

describe('viewing a transaction', () => {
	const transaction: RupeeTransaction = {
		location: { file: 'bank.rupee', line: 12 },
		date: Temporal.PlainDate.from('2026-08-29'),
		time: Temporal.PlainTime.from('18:45:30'),
		description: 'Bought shares',
		metadata: {},
		postings: [
			{
				account: 'Assets:Broker',
				amount: amount('10'),
				commodity: 'INFY',
				price: { kind: PriceKind.Unit, amount: amount('1500.125'), commodity: 'INR' },
				balance: null,
				metadata: {},
			},
			{
				account: 'Assets:Bank',
				amount: amount('-15001.25'),
				commodity: 'INR',
				price: null,
				balance: null,
				metadata: {},
			},
		],
	};

	it('flattens it into plain text for the page', () => {
		expect(viewTransaction(transaction)).toEqual({
			file: 'bank.rupee',
			line: 12,
			date: '2026-08-29',
			time: '18:45',
			description: 'Bought shares',
			postings: [
				{ account: 'Assets:Broker', amount: '10.00 INFY', price: '@ 1500.125' },
				{ account: 'Assets:Bank', amount: '-15001.25', price: null },
			],
		});
	});

	it('shows a total price with @@', () => {
		const [first] = transaction.postings;
		const priced = {
			...transaction,
			postings: [
				{ ...first!, price: { kind: PriceKind.Total, amount: amount('5'), commodity: 'USD' } },
			],
		};
		expect(viewTransaction(priced).postings[0]?.price).toBe('@@ 5.00 USD');
	});

	it('leaves an untimed transaction without a time', () => {
		expect(viewTransaction({ ...transaction, time: null }).time).toBeNull();
	});
});
