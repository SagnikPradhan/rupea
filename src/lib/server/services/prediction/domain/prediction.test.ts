import type { Amount, RupeeTransaction } from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';
import {
	accountsOf,
	fallback,
	pastOf,
	predict,
	type Embedded,
	type Example,
	type Knowledge,
} from './prediction';

const amount = (n: bigint) => n as Amount;
const axis = (i: number) => Float32Array.from({ length: 4 }, (_, d) => (d === i ? 1 : 0));
const today = Temporal.PlainDate.from('2026-10-01');

const example = (account: string, over: Partial<Example> = {}): Example => ({
	account,
	amount: amount(100n),
	date: today,
	text: 'x',
	vector: axis(0),
	...over,
});

const knowledge = (over: Partial<Knowledge> = {}): Knowledge => ({
	thresholds: { history: 0.15, name: 0.35 },
	account: 'Assets:Bank',
	today,
	examples: [],
	names: [],
	...over,
});

const out = (vector: Float32Array | null = axis(0)): Embedded => ({
	amount: amount(-100n),
	description: 'x',
	vector,
});

describe('predicting from history', () => {
	it('names the account of the nearest postings', () => {
		const guess = predict(knowledge({ examples: [example('Expenses:Food')] }))(out());
		expect(guess).toMatchObject({ account: 'Expenses:Food', source: 'history' });
	});

	it('grows surer as more postings agree', () => {
		const one = predict(knowledge({ examples: [example('Expenses:Food')] }))(out());
		const three = predict(knowledge({ examples: Array(3).fill(example('Expenses:Food')) }))(out());
		expect(three.score).toBeGreaterThan(one.score);
	});

	it('lets the more common account win over a single nearer one', () => {
		const near = example('Expenses:Fuel', { vector: axis(0) });
		const farther = example('Expenses:Food', { vector: Float32Array.of(0.8, 0.6, 0, 0) });
		const guess = predict(knowledge({ examples: [near, farther, farther, farther] }))(out());
		expect(guess.account).toBe('Expenses:Food');
	});

	it('lets recent postings count for more than old ones', () => {
		const old = example('Expenses:Fuel', { date: Temporal.PlainDate.from('2021-10-01') });
		const recent = example('Expenses:Food', { date: Temporal.PlainDate.from('2026-09-01') });
		expect(predict(knowledge({ examples: [old, recent] }))(out()).account).toBe('Expenses:Food');
	});

	it('only follows postings on the other side of the money', () => {
		// A posting that took money out of an account, like the line does, is not
		// what the other side of a line that took money out looks like.
		const same = example('Expenses:Food', { amount: amount(-100n) });
		expect(predict(knowledge({ examples: [same] }))(out()).source).toBe('fallback');
	});

	it('never puts spending under income', () => {
		const wrong = example('Income:Salary');
		expect(predict(knowledge({ examples: [wrong] }))(out()).source).toBe('fallback');
	});

	it('never names the statement account', () => {
		const own = example('Assets:Bank');
		expect(predict(knowledge({ examples: [own] }))(out()).source).toBe('fallback');
	});

	it('ignores postings that are not near enough', () => {
		const far = example('Expenses:Food', { vector: axis(1) });
		expect(predict(knowledge({ examples: [far] }))(out()).source).toBe('fallback');
	});

	it('adds how well an account name fits', () => {
		const weak = {
			examples: [example('Expenses:Food', { vector: Float32Array.of(0.1, 1, 0, 0) })],
		};
		const shy = predict(knowledge({ ...weak }))(out());
		const fits = predict(
			knowledge({ ...weak, names: [{ account: 'Expenses:Food', vector: axis(0) }] }),
		)(out());
		expect(shy.source).toBe('fallback');
		expect(fits).toMatchObject({ account: 'Expenses:Food', source: 'history' });
	});
});

describe('predicting from names', () => {
	it('names the account whose name fits when there is no history', () => {
		const names = [
			{ account: 'Expenses:Food', vector: axis(0) },
			{ account: 'Expenses:Fuel', vector: axis(1) },
		];
		expect(predict(knowledge({ names }))(out())).toMatchObject({
			account: 'Expenses:Food',
			source: 'name',
		});
	});

	it('never names the wrong side or the statement account', () => {
		const names = [
			{ account: 'Income:Salary', vector: axis(0) },
			{ account: 'Assets:Bank', vector: axis(0) },
		];
		expect(predict(knowledge({ names }))(out()).source).toBe('fallback');
	});

	it('names income for money in', () => {
		const names = [{ account: 'Income:Salary', vector: axis(0) }];
		const line = { ...out(), amount: amount(500n) };
		expect(predict(knowledge({ names }))(line).account).toBe('Income:Salary');
	});
});

describe('leaving a line uncategorised', () => {
	it('does so when nothing fits', () => {
		expect(predict(knowledge())(out())).toEqual(fallback(amount(-100n)));
	});

	it('does so for a line with no words', () => {
		const names = [{ account: 'Expenses:Food', vector: axis(0) }];
		expect(predict(knowledge({ names }))(out(null)).source).toBe('fallback');
	});

	it('files money out under expenses and money in under income', () => {
		expect(fallback(amount(-1n)).account).toBe('Expenses:Uncategorized');
		expect(fallback(amount(1n)).account).toBe('Income:Uncategorized');
	});
});

const transaction = (description: string, postings: [string, bigint][], date = '2026-09-01') =>
	({
		location: { file: 'a.rupee', line: 1 },
		date: Temporal.PlainDate.from(date),
		time: null,
		description,
		metadata: {},
		postings: postings.map(([account, n]) => ({
			account,
			amount: amount(n),
			commodity: 'INR',
			price: null,
			balance: null,
			metadata: {},
		})),
	}) satisfies RupeeTransaction;

describe('what is learned from', () => {
	const ledger = [
		transaction('UPI/123456/SWIGGY', [
			['Assets:Bank', -300n],
			['Expenses:Food', 300n],
		]),
		transaction('Mystery', [
			['Assets:Bank', -5n],
			['Expenses:Uncategorized', 5n],
		]),
		transaction('UPI/987654/', [
			['Assets:Bank', -9n],
			['Expenses:Other', 9n],
		]),
	];

	it('leaves out postings nobody has categorised, and descriptions with no words', () => {
		expect(pastOf(ledger).map((p) => p.account)).toEqual([
			'Assets:Bank',
			'Expenses:Food',
			'Assets:Bank',
		]);
	});

	it('starts with the latest', () => {
		const later = transaction('Later', [['Expenses:Fuel', 1n]], '2026-09-30');
		expect(pastOf([...ledger, later])[0]?.account).toBe('Expenses:Fuel');
	});

	it('knows the accounts posted to, but the uncategorised', () => {
		expect(accountsOf(ledger)).toEqual(['Assets:Bank', 'Expenses:Food', 'Expenses:Other']);
	});
});
