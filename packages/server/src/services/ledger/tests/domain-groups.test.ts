import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { checkGroups, counted, type GroupMember } from '#services/ledger/domain/groups.ts';
import type { RupeaMetadata } from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';

const member = (
	id: string,
	metadata: RupeaMetadata,
	postings: [string, string][] = [
		['Liabilities:Card', '-1299'],
		['Expenses:Shopping', '1299'],
	],
): GroupMember => ({
	id,
	location: { file: `${id}.rupea`, line: 1 },
	metadata,
	postings: postings.map(([account, amount]) => ({
		account,
		amount: parseAmount(amount) as Amount,
		commodity: 'INR',
		price: null,
		cost: null,
		balance: null,
		metadata: {},
		comment: null,
	})),
});

const ID = '2026-10-01-amazon-otter';

describe('checking groups', () => {
	it('leaves out the evidence of a sound group', () => {
		expect(
			checkGroups([
				member('order', { group: [ID] }, [
					['Liabilities:Card', '-1299'],
					['Expenses:Books', '499'],
					['Expenses:Electronics', '800'],
				]),
				member('card', { 'same-as': [ID] }),
				member('pdf', { 'same-as': [ID] }),
				member('cash', {}),
			]),
		).toEqual({ uncounted: ['card', 'pdf'], failed: [] });
	});

	it('accepts a primary whose evidence has gone', () => {
		expect(checkGroups([member('order', { group: [ID] })])).toEqual({
			uncounted: [],
			failed: [],
		});
	});

	it('counts every member of a group without a primary', () => {
		expect(
			checkGroups([member('a', { 'same-as': [ID] }), member('b', { 'same-as': [ID] })]),
		).toEqual({
			uncounted: [],
			failed: [
				{
					type: 'GroupWithoutPrimary',
					group: ID,
					location: 'a.rupea:1, b.rupea:1',
				},
			],
		});
	});

	it('counts every member of a group with several primaries', () => {
		expect(
			checkGroups([
				member('a', { group: [ID] }),
				member('b', { group: [ID] }),
				member('c', { 'same-as': [ID] }),
			]),
		).toEqual({
			uncounted: [],
			failed: [
				{
					type: 'GroupWithManyPrimaries',
					group: ID,
					location: 'a.rupea:1, b.rupea:1',
				},
			],
		});
	});

	it.each([
		['two roles', { group: [ID], 'same-as': [ID] }],
		['two groups', { 'same-as': [ID, 'other'] }],
	])('counts a transaction with %s on its own', (_, metadata) => {
		expect(checkGroups([member('a', { group: [ID] }), member('b', metadata)])).toEqual({
			uncounted: [],
			failed: [{ type: 'GroupInvalidMembership', location: 'b.rupea:1' }],
		});
	});

	it('reports evidence that disagrees on a shared balance account, and still leaves it out', () => {
		expect(
			checkGroups([
				member('hdfc', { group: [ID] }, [
					['Assets:HDFC', '-1000'],
					['Assets:IBKR', '1000'],
				]),
				member('ibkr', { 'same-as': [ID] }, [
					['Assets:IBKR', '999'],
					['Assets:HDFC', '-999'],
				]),
			]),
		).toEqual({
			uncounted: ['ibkr'],
			failed: ['Assets:IBKR', 'Assets:HDFC'].map((account) => ({
				type: 'GroupDisagreement',
				group: ID,
				location: 'ibkr.rupea:1',
				account,
				expected: account === 'Assets:IBKR' ? '1000.00' : '-1000.00',
				actual: account === 'Assets:IBKR' ? '999.00' : '-999.00',
			})),
		});
	});

	it('ignores categories and accounts only one side posts to', () => {
		expect(
			checkGroups([
				member('order', { group: [ID] }, [
					['Liabilities:Card', '-1299'],
					['Expenses:Books', '1299'],
				]),
				member('bank', { 'same-as': [ID] }, [
					['Liabilities:Card', '-1299'],
					['Assets:Wallet', '-1'],
					['Expenses:Shopping', '1300'],
				]),
			]).failed,
		).toEqual([]);
	});
});

describe('counting transactions', () => {
	it('marks evidence as not counted, and everything else as counted', () => {
		const c = counted([
			member('order', { group: [ID] }),
			member('card', { 'same-as': [ID] }),
			member('cash', {}),
		]);

		expect(c.transactions.map((t) => [t.id, t.counted])).toEqual([
			['order', true],
			['card', false],
			['cash', true],
		]);
		expect(c.uncounted).toEqual(['card']);
	});

	it('counts every member of a broken group, and says why', () => {
		const c = counted([member('a', { 'same-as': [ID] }), member('b', { 'same-as': [ID] })]);

		expect(c.transactions.every((t) => t.counted)).toBe(true);
		expect(c.failed).toMatchObject([{ type: 'GroupWithoutPrimary' }]);
	});
});
