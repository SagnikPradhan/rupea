import { describe, expect, it } from 'vitest';
import { parentsIn, type AccountRow } from '../src/account-tree.ts';

const rows = (...names: string[]): AccountRow[] =>
	names.map((written) => {
		const account = written.replace('*', '');
		const parent = account.includes(':') ? account.slice(0, account.lastIndexOf(':')) : null;
		return { account, parent, posted: written.endsWith('*') };
	});

describe('parentsIn', () => {
	const tree = rows(
		'Assets',
		'Assets:Bank',
		'Assets:Bank:HDFC*',
		'Assets:Bank:SBI*',
		'Assets:Cash*',
	);

	it('leaves out an account with one under it and nothing posted, drawing that one in its place', () => {
		const parents = parentsIn(rows('Assets', 'Assets:Bank', 'Assets:Bank:HDFC*'));
		expect(parents).toEqual({ Assets: null, 'Assets:Bank:HDFC': 'Assets' });
	});

	it('keeps an account with two under it, and one posted to', () => {
		expect(parentsIn(tree)['Assets:Bank:HDFC']).toBe('Assets:Bank');
		expect(parentsIn(rows('Assets', 'Assets:Bank*', 'Assets:Bank:HDFC*'))['Assets:Bank:HDFC']).toBe(
			'Assets:Bank',
		);
	});

	it('always keeps a top account, though only one is under it', () => {
		expect(parentsIn(rows('Liabilities', 'Liabilities:Card*'))).toEqual({
			Liabilities: null,
			'Liabilities:Card': 'Liabilities',
		});
	});
});
