import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { checkEvents, counted, type EventMember } from '#services/ledger/domain/events.ts';
import type { RupeaMetadata } from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';

const member = (
	id: string,
	metadata: RupeaMetadata,
	postings: [string, string][] = [
		['Liabilities:Card', '-1299'],
		['Expenses:Shopping', '1299'],
	],
): EventMember => ({
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
	})),
});

const ID = '2026-10-01-amazon-otter';

describe('checking events', () => {
	it('leaves out the evidence of a sound event', () => {
		expect(
			checkEvents([
				member('order', { event: [ID] }, [
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
		expect(checkEvents([member('order', { event: [ID] })])).toEqual({
			uncounted: [],
			failed: [],
		});
	});

	it('counts every member of an event without a primary', () => {
		expect(
			checkEvents([member('a', { 'same-as': [ID] }), member('b', { 'same-as': [ID] })]),
		).toEqual({
			uncounted: [],
			failed: [
				{
					type: 'EventWithoutPrimary',
					event: ID,
					location: 'a.rupea:1, b.rupea:1',
				},
			],
		});
	});

	it('counts every member of an event with several primaries', () => {
		expect(
			checkEvents([
				member('a', { event: [ID] }),
				member('b', { event: [ID] }),
				member('c', { 'same-as': [ID] }),
			]),
		).toEqual({
			uncounted: [],
			failed: [
				{
					type: 'EventWithManyPrimaries',
					event: ID,
					location: 'a.rupea:1, b.rupea:1',
				},
			],
		});
	});

	it.each([
		['two roles', { event: [ID], 'same-as': [ID] }],
		['two events', { 'same-as': [ID, 'other'] }],
	])('counts a transaction with %s on its own', (_, metadata) => {
		expect(checkEvents([member('a', { event: [ID] }), member('b', metadata)])).toEqual({
			uncounted: [],
			failed: [{ type: 'EventInvalidMembership', location: 'b.rupea:1' }],
		});
	});

	it('reports evidence that disagrees on a shared balance account, and still leaves it out', () => {
		expect(
			checkEvents([
				member('hdfc', { event: [ID] }, [
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
				type: 'EventDisagreement',
				event: ID,
				location: 'ibkr.rupea:1',
				account,
				expected: account === 'Assets:IBKR' ? '1000.00' : '-1000.00',
				actual: account === 'Assets:IBKR' ? '999.00' : '-999.00',
			})),
		});
	});

	it('ignores categories and accounts only one side posts to', () => {
		expect(
			checkEvents([
				member('order', { event: [ID] }, [
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
			member('order', { event: [ID] }),
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

	it('counts every member of a broken event, and says why', () => {
		const c = counted([member('a', { 'same-as': [ID] }), member('b', { 'same-as': [ID] })]);

		expect(c.transactions.every((t) => t.counted)).toBe(true);
		expect(c.failed).toMatchObject([{ type: 'EventWithoutPrimary' }]);
	});
});
