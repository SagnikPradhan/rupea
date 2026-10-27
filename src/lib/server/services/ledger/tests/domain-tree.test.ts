import { parentsIn, partsIn, type AccountNode } from '#services/ledger/domain/tree.ts';
import { AccountType } from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';

/** A tree of the accounts named, each under the one its name is under; those starred are posted to. */
const treeOf = (...names: string[]): AccountNode[] =>
	names.map((written) => {
		const name = written.replace('*', '');
		const parent = name.includes(':') ? name.slice(0, name.lastIndexOf(':')) : null;
		const top = name.split(':')[0] as keyof typeof AccountType;
		return {
			id: name,
			name,
			type: AccountType[top],
			parentId: parent,
			posted: written.endsWith('*'),
		};
	});

const tree = treeOf(
	'Assets',
	'Assets:Bank',
	'Assets:Bank:Savings',
	'Assets:Bank:Savings:HDFC*',
	'Assets:Bank:Savings:SBI*',
	'Assets:Cash*',
	'Expenses',
	'Expenses:Food*',
	'Liabilities',
	'Liabilities:Card*',
);

const partsOf = (account: string | null) => {
	const { parts, byCommodity } = partsIn(tree, account);
	return { parts: parts.map((p) => `${p.accountId} ${p.part}`), byCommodity };
};

describe('parentsIn', () => {
	it('leaves out an account with one under it and nothing posted, drawing that one in its place', () => {
		const parents = parentsIn(tree);
		expect(parents).toMatchObject({
			'Assets:Bank:Savings': 'Assets',
			'Assets:Bank:Savings:HDFC': 'Assets:Bank:Savings',
			'Assets:Cash': 'Assets',
		});
		expect(Object.hasOwn(parents, 'Assets:Bank')).toBe(false);
	});

	it('keeps an account posted to, though only one is under it', () => {
		const posted = treeOf('Assets', 'Assets:Bank*', 'Assets:Bank:Savings*');
		expect(parentsIn(posted)['Assets:Bank:Savings']).toBe('Assets:Bank');
	});

	it('always keeps a top account, though only one is under it', () => {
		expect(parentsIn(tree)).toMatchObject({ Liabilities: null, 'Liabilities:Card': 'Liabilities' });
	});
});

describe('partsIn', () => {
	it('splits every balance account at the first account under each top one that divides', () => {
		expect(partsOf(null)).toEqual({
			parts: [
				'Assets Assets',
				'Assets:Bank Assets:Bank',
				'Assets:Bank:Savings Assets:Bank:Savings',
				'Assets:Bank:Savings:HDFC Assets:Bank:Savings',
				'Assets:Bank:Savings:SBI Assets:Bank:Savings',
				'Assets:Cash Assets:Cash',
				'Liabilities Liabilities',
				'Liabilities:Card Liabilities:Card',
			],
			byCommodity: false,
		});
	});

	it('splits an account that divides into nothing by its commodities instead, in any case', () => {
		expect(partsOf('assets:bank')).toEqual({
			parts: [
				'Assets:Bank:Savings Assets:Bank:Savings',
				'Assets:Bank:Savings:HDFC Assets:Bank:Savings:HDFC',
				'Assets:Bank:Savings:SBI Assets:Bank:Savings:SBI',
			],
			byCommodity: false,
		});
		expect(partsOf('Assets:Cash')).toEqual({
			parts: ['Assets:Cash Assets:Cash'],
			byCommodity: true,
		});
	});

	it('counts nothing for an account that is not in the tree', () => {
		expect(partsOf('Assets:Gold')).toEqual({ parts: [], byCommodity: false });
	});
});
