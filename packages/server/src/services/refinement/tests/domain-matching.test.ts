import {
	type Amount,
	GroupRole,
	type RupeaMetadata,
	parseAmount,
} from '#services/ledger/application/language.ts';
import { describe, expect, it } from 'vitest';
import {
	Confidence,
	fingerprint,
	suggest,
	type MatchedTransaction,
} from '#services/refinement/domain/matching.ts';

const transaction = (
	id: string,
	description: string,
	postings: [string, string][] = [
		['Liabilities:Card', '-1299'],
		['Expenses:Shopping', '1299'],
	],
	metadata: RupeaMetadata = {},
): MatchedTransaction => ({
	id,
	location: { file: `${id.split('/')[0]}.rupea`, line: Number(id.split('/')[1] ?? 1) },
	date: Temporal.PlainDate.from('2026-10-01'),
	time: null,
	description,
	metadata,
	comment: null,
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

const run = (t: MatchedTransaction[], pairs: [string, string][], dismissed: string[] = []) =>
	suggest({
		transactions: t,
		pairs: pairs.map(([ours, theirs]) => ({ ours, theirs })),
		dismissed: new Set(dismissed),
	});

const roles = (s: ReturnType<typeof run>) =>
	s.map((x) => [x.group, x.confidence, x.links.map((l) => `${l.file}:${l.line} ${l.role}`)]);

describe('suggesting groups', () => {
	it('makes the transaction with more postings the primary of a new group', () => {
		const card = transaction('card/1', 'AMAZON PAY INDIA');
		const order = transaction('amazon/4', 'Amazon order 402-123', [
			['Liabilities:Card', '-1299'],
			['Expenses:Books', '499'],
			['Expenses:Electronics', '800'],
		]);

		expect(roles(run([card, order], [['card/1', 'amazon/4']]))).toEqual([
			[
				null,
				Confidence.Possible,
				[`amazon.rupea:4 ${GroupRole.Primary}`, `card.rupea:1 ${GroupRole.Evidence}`],
			],
		]);
	});

	it('prefers the transaction being refined on a tie, and calls a same description a duplicate', () => {
		const a = transaction('sep/3', 'UPI GROCER');
		const b = transaction('oct/1', 'UPI  grocer');

		expect(roles(run([a, b], [['oct/1', 'sep/3']]))).toEqual([
			[
				null,
				Confidence.Duplicate,
				[`oct.rupea:1 ${GroupRole.Primary}`, `sep.rupea:3 ${GroupRole.Evidence}`],
			],
		]);
	});

	it('joins a group either side is already in', () => {
		const order = transaction('amazon/1', 'Order', undefined, { group: ['e1'] });
		const card = transaction('card/1', 'AMAZON');
		const csv = transaction('csv/1', 'AMAZON', undefined, { 'same-as': ['e2'] });

		expect(roles(run([order, card], [['card/1', 'amazon/1']]))).toEqual([
			['e1', Confidence.Possible, [`card.rupea:1 ${GroupRole.Evidence}`]],
		]);
		expect(roles(run([order, csv], [['amazon/1', 'csv/1']]))).toEqual([]);
		expect(roles(run([card, csv], [['card/1', 'csv/1']]))).toEqual([
			['e2', Confidence.Duplicate, [`card.rupea:1 ${GroupRole.Evidence}`]],
		]);
	});

	it('pairs identical charges one to one', () => {
		const ours = ['oct/1', 'oct/4'].map((id) => transaction(id, 'TEA'));
		const theirs = ['sep/1', 'sep/4', 'sep/7'].map((id) => transaction(id, 'TEA'));
		const pairs = ours.flatMap((o) => theirs.map((t): [string, string] => [o.id, t.id]));

		expect(run([...ours, ...theirs], pairs).map((s) => [s.ours.id, s.theirs.id])).toEqual([
			['oct/1', 'sep/1'],
			['oct/4', 'sep/4'],
		]);
	});

	it('never puts a second member from the refined file into a group', () => {
		const first = transaction('oct/1', 'TEA', undefined, { group: ['e1'] });
		const second = transaction('oct/4', 'TEA');
		const theirs = transaction('sep/1', 'TEA', undefined, { 'same-as': ['e1'] });

		expect(
			run(
				[first, second, theirs],
				[
					['oct/1', 'sep/1'],
					['oct/4', 'sep/1'],
				],
			),
		).toEqual([]);
	});

	it('leaves out dismissed pairs, without them using up a transaction', () => {
		const ours = transaction('oct/1', 'TEA');
		const old = transaction('sep/1', 'TEA');
		const other = transaction('sep/4', 'TEA');

		const s = run(
			[ours, old, other],
			[
				['oct/1', 'sep/1'],
				['oct/1', 'sep/4'],
			],
			[fingerprint(ours, old)],
		);
		expect(s.map((x) => x.theirs.id)).toEqual(['sep/4']);
	});
});

describe('suggesting transfers', () => {
	const side = (id: string, held: string, amount: string, other = 'Expenses:Unknown') =>
		transaction(id, 'TRANSFER', [
			[held, amount],
			[other, amount.startsWith('-') ? amount.slice(1) : `-${amount}`],
		]);

	const settled = (a: MatchedTransaction, b: MatchedTransaction) =>
		run([a, b], [[a.id, b.id]]).flatMap((s) => s.links.map((l) => [l.file, l.settledAs]));

	it('settles each side as the other account, and only ever as possible', () => {
		const out = side('hdfc/1', 'Assets:HDFC', '-100');
		const into = side('sbi/1', 'Assets:SBI', '100', 'Income:Unknown');

		expect(settled(out, into)).toEqual([
			['hdfc.rupea', 'Assets:SBI'],
			['sbi.rupea', 'Assets:HDFC'],
		]);
		expect(run([out, into], [['hdfc/1', 'sbi/1']]).map((s) => s.confidence)).toEqual([
			Confidence.Possible,
		]);
	});

	it.each([
		[
			'both sides on the same account',
			side('a/1', 'Assets:HDFC', '-100'),
			side('b/1', 'Assets:HDFC', '100'),
		],
		[
			'a side split across two balance accounts',
			transaction('a/1', 'TRANSFER', [
				['Assets:HDFC', '-100'],
				['Assets:SBI', '60'],
				['Expenses:Unknown', '40'],
			]),
			side('b/1', 'Assets:SBI', '100'),
		],
		[
			'an Unknown leg that is not the moved amount',
			transaction('a/1', 'TRANSFER', [
				['Assets:HDFC', '-100'],
				['Expenses:Unknown', '60'],
				['Expenses:Food', '40'],
			]),
			side('b/1', 'Assets:SBI', '100'),
		],
		[
			'a side already in a group',
			transaction('a/1', 'TRANSFER', undefined, { group: ['e1'] }),
			side('b/1', 'Assets:SBI', '100'),
		],
	])('suggests nothing for %s', (_, a, b) => {
		expect(settled(a, b)).toEqual([]);
	});
});

describe('fingerprinting a pair', () => {
	it('ignores which side is which, and changes with either', () => {
		const a = transaction('a/1', 'TEA');
		const b = transaction('b/1', 'COFFEE');

		expect(fingerprint(a, b)).toBe(fingerprint(b, a));
		expect(fingerprint(a, { ...b, description: 'COFFEE BEANS' })).not.toBe(fingerprint(a, b));
	});
});
