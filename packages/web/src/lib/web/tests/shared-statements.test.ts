import { isWaitingIn, suggestedFile } from '#lib/web/shared/statements.ts';
import { describe, expect, it } from 'vitest';

const found = [
	{ date: '2026-09-30', postings: [{ account: 'Assets:Bank:HDFC' }] },
	{ date: '2026-10-02', postings: [{ account: 'Assets:Bank:HDFC' }] },
];

describe('a suggested file', () => {
	it('is named for the account and the month the statement ends in', () =>
		expect(suggestedFile('20261027/hdfc.xls', found)).toBe('hdfc/2026-10.rupea'));

	it('keeps a ledger file’s own name, as it holds many accounts', () =>
		expect(suggestedFile('20261027/books.ledger', found)).toBe('books.rupea'));

	it('falls back on the statement’s name when nothing was found', () =>
		expect(suggestedFile('20261027/hdfc.xls', [])).toBe('hdfc.rupea'));
});

describe('statements waiting', () => {
	const added = { key: 'a.csv', file: 'bank.rupea' };
	const fresh = { key: 'b.csv', file: null };

	it('is nothing when none is uploaded or all are added', () => {
		expect(isWaitingIn([], [])).toBe(false);
		expect(isWaitingIn([added], [])).toBe(false);
	});

	it('is nothing while the rest are failed or not recognised', () => {
		expect(isWaitingIn([fresh], [{ statement: 'b.csv', status: 'failed' }])).toBe(false);
		expect(isWaitingIn([fresh], [{ statement: 'b.csv', status: 'succeeded' }])).toBe(false);
	});

	it('is something while one is new, being read or ready', () => {
		expect(isWaitingIn([added, fresh], [])).toBe(true);
		expect(isWaitingIn([{ key: 'c.csv', file: '_/imports/c.rupea' }], [])).toBe(true);
		expect(isWaitingIn([fresh], [{ statement: 'b.csv', status: 'running' }])).toBe(true);
	});
});
