import { conditionFor } from '#services/ledger/adapters/database-filters.ts';
import { EVERYTHING, hasCounter, type Filter } from '#services/ledger/domain/filters.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { sql } from 'kysely';
import { describe, expect } from 'vitest';

const account: Filter = { kind: 'account', name: 'Assets' };
const counter: Filter = { kind: 'counter', test: { kind: 'account', name: 'Income' } };

describe('hasCounter', () => {
	it('is false for a tree of accounts, and for everything', () => {
		const accounts: Filter = {
			kind: 'any',
			of: [account, { kind: 'not', of: { kind: 'all', of: [account] } }],
		};

		expect(hasCounter(accounts)).toBe(false);
		expect(hasCounter(EVERYTHING)).toBe(false);
	});

	it('is true for a counter anywhere in the tree', () => {
		expect(hasCounter(counter)).toBe(true);
		expect(hasCounter({ kind: 'not', of: counter })).toBe(true);
		expect(hasCounter({ kind: 'all', of: [account, { kind: 'any', of: [counter] }] })).toBe(true);
	});
});

describe('conditionFor', () => {
	const compiled = (db: Parameters<typeof conditionFor>[0], filter: Filter) =>
		db
			.selectFrom('postings as p')
			.select('p.id')
			.where((e) =>
				conditionFor(db, {
					filter,
					ledgerId: 'ledger',
					account: e.ref('p.accountId'),
					transaction: e.ref('p.transactionId'),
				}),
			)
			.compile();

	it('binds the names and the ledger instead of writing them into the query', ({ db }) => {
		const name = "Assets'; drop table postings; --";
		const query = compiled(db, { kind: 'account', name });

		expect(query.sql).not.toContain('drop table');
		expect(query.parameters).toEqual(['ledger', name, name]);
	});

	it('writes an account as the accounts of the ledger named so or under it', ({ db }) => {
		const query = compiled(db, account);

		expect(query.sql).toContain('"p"."account_id" in (select "a"."id" from "accounts" as "a"');
		expect(query.sql).toContain("|| ':'");
	});

	it('writes all, any and not as and, or and not, and the empty ones as 1 = 1 and 1 = 0', ({
		db,
	}) => {
		const both = compiled(db, { kind: 'all', of: [account, account] }).sql;
		const either = compiled(db, { kind: 'any', of: [account, counter] }).sql;
		const except = compiled(db, { kind: 'not', of: account }).sql;

		expect(both).toContain(' and "p"."account_id" in ');
		expect(either).toContain(') or exists (select');
		expect(except).toContain('not ');
		expect(compiled(db, EVERYTHING).sql).toMatch(/where 1 = 1$/);
		expect(compiled(db, { kind: 'any', of: [] }).sql).toMatch(/where 1 = 0$/);
	});

	it('writes an any of accounts as one subquery of the accounts, not one for each', ({ db }) => {
		const other: Filter = { kind: 'account', name: 'Expenses' };
		const query = compiled(db, { kind: 'any', of: [account, other] });

		expect(query.sql.match(/"account_id" in \(select/g)).toHaveLength(1);
		expect(query.sql).not.toContain(' or "p"."account_id" in ');
		expect(query.parameters).toEqual(['ledger', 'Assets', 'Assets', 'Expenses', 'Expenses']);
	});

	it('writes a counter as the other postings of the transaction on other accounts', ({ db }) => {
		const query = compiled(db, counter);

		expect(query.sql).toContain('exists (select "q"."id" from "postings" as "q"');
		expect(query.sql).toContain('"q"."transaction_id" = "p"."transaction_id"');
		expect(query.sql).toContain('"q"."account_id" <> "p"."account_id"');
		expect(query.sql).toContain('"q"."account_id" in (select');
	});

	it('passes no posting a counter where postings are added up and have no transaction', ({
		db,
	}) => {
		const query = db
			.selectFrom('postings as p')
			.select('p.id')
			.where(() =>
				conditionFor(db, {
					filter: counter,
					ledgerId: 'ledger',
					account: sql.ref<string>('p.accountId'),
					transaction: null,
				}),
			)
			.compile();

		expect(query.sql).toMatch(/where false$/);
	});
});
