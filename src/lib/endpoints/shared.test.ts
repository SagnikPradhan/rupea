import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { Account, Key, SchemaKey } from './shared';

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

	it('names the account types an account can start with', () => {
		expect(issues(Account, 'Bank:HDFC')).toEqual([
			'An account starts with one of Assets, Liabilities, Income, Expenses, Equity.',
		]);
	});

	it('takes the account type as written, not lowercased', () => {
		expect(v.safeParse(Account, 'assets:bank').success).toBe(false);
	});
});
