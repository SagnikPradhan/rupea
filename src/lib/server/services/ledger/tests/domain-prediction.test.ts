import type { Amount } from '#services/ledger/application/shared.ts';
import { describe, expect, it } from 'vitest';
import {
	classify,
	fallback,
	predict,
	textsOf,
	type Embedded,
	type Knowledge,
	type Neighbour,
} from '#services/ledger/domain/prediction.ts';

const amount = (n: bigint) => n as Amount;
const axis = (i: number) => Float32Array.from({ length: 4 }, (_, d) => (d === i ? 1 : 0));
const today = Temporal.PlainDate.from('2026-10-01');

const neighbour = (account: string, over: Partial<Neighbour> = {}): Neighbour => ({
	account,
	amount: amount(100n),
	date: today,
	similarity: 1,
	...over,
});

const knowledge = (over: Partial<Knowledge> = {}): Knowledge => ({
	thresholds: { history: 0.15, spelled: 0.5, name: 0.35 },
	account: 'Assets:Bank',
	today,
	accounts: [],
	names: [],
	...over,
});

const out = (neighbours: Neighbour[] = [], vector: Float32Array | null = axis(0)): Embedded => ({
	amount: amount(-100n),
	description: 'x',
	vector,
	neighbours,
});

describe('predicting from history', () => {
	it('names the account of the nearest postings', () => {
		const guess = predict(knowledge())(out([neighbour('Expenses:Food')]));
		expect(guess).toMatchObject({ account: 'Expenses:Food', source: 'history' });
	});

	it('grows surer as more postings agree', () => {
		const one = predict(knowledge())(out([neighbour('Expenses:Food')]));
		const three = predict(knowledge())(out(Array(3).fill(neighbour('Expenses:Food'))));
		expect(three.score).toBeGreaterThan(one.score);
	});

	it('lets the more common account win over a single nearer one', () => {
		const near = neighbour('Expenses:Fuel');
		const farther = neighbour('Expenses:Food', { similarity: 0.8 });
		const guess = predict(knowledge())(out([near, farther, farther, farther]));
		expect(guess.account).toBe('Expenses:Food');
	});

	it('keeps only the nearest few', () => {
		const near = Array(5).fill(neighbour('Expenses:Food', { similarity: 0.9 }));
		const far = Array(10).fill(neighbour('Expenses:Fuel', { similarity: 0.5 }));
		expect(predict(knowledge())(out([...far, ...near])).account).toBe('Expenses:Food');
	});

	it('lets recent postings count for more than old ones', () => {
		const old = neighbour('Expenses:Fuel', { date: Temporal.PlainDate.from('2021-10-01') });
		const recent = neighbour('Expenses:Food', { date: Temporal.PlainDate.from('2026-09-01') });
		expect(predict(knowledge())(out([old, recent])).account).toBe('Expenses:Food');
	});

	it('only follows postings on the other side of the money', () => {
		// A posting that took money out of an account, like the line does, is not
		// what the other side of a line that took money out looks like.
		const same = neighbour('Expenses:Food', { amount: amount(-100n) });
		expect(predict(knowledge())(out([same])).source).toBe('fallback');
	});

	it('never puts spending under income', () => {
		expect(predict(knowledge())(out([neighbour('Income:Salary')])).source).toBe('fallback');
	});

	it('never names the statement account', () => {
		expect(predict(knowledge())(out([neighbour('Assets:Bank')])).source).toBe('fallback');
	});

	it('never learns from postings nobody has categorised', () => {
		const guessed = neighbour('Expenses:Uncategorized');
		expect(predict(knowledge())(out([guessed])).source).toBe('fallback');
	});

	it('ignores postings that are not near enough', () => {
		const far = neighbour('Expenses:Food', { similarity: 0 });
		expect(predict(knowledge())(out([far])).source).toBe('fallback');
	});

	it('adds how well an account name fits', () => {
		const weak = [neighbour('Expenses:Food', { similarity: 0.1 })];
		const shy = predict(knowledge())(out(weak));
		const fits = predict(knowledge({ names: [{ account: 'Expenses:Food', vector: axis(0) }] }))(
			out(weak),
		);
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

describe('predicting from a name the line spells out', () => {
	const accounts = ['Expenses:Utility:Github', 'Expenses:Health:Pharmacy:Apollo'];
	const line = (description: string, neighbours: Neighbour[] = []) => ({
		...out(neighbours),
		description,
	});

	it('names the account whose last part is a word of the line', () => {
		expect(predict(knowledge({ accounts }))(line('GITHUB, SAN FRANCISCO'))).toMatchObject({
			account: 'Expenses:Utility:Github',
			source: 'spelled',
		});
	});

	it('finds a long enough name inside a word', () => {
		const guess = predict(knowledge({ accounts }))(line('UPI-APOLLOPHARMACY-1234567890'));
		expect(guess.account).toBe('Expenses:Health:Pharmacy:Apollo');
	});

	it('lets sure history win over a spelled name', () => {
		const sure = Array(5).fill(neighbour('Expenses:Software'));
		const guess = predict(knowledge({ accounts }))(line('github', sure));
		expect(guess).toMatchObject({ account: 'Expenses:Software', source: 'history' });
	});

	it('wins over unsure history', () => {
		const unsure = [neighbour('Expenses:Software', { similarity: 0.9 })];
		expect(predict(knowledge({ accounts }))(line('github', unsure)).source).toBe('spelled');
	});

	it('names nothing when two accounts are spelled', () => {
		const both = [...accounts, 'Expenses:Shopping:Github'];
		expect(predict(knowledge({ accounts: both }))(line('github')).source).toBe('fallback');
	});

	it('never names a global account the ledger does not have', () => {
		const names = [{ account: 'Expenses:Transport:Taxi', vector: axis(1) }];
		expect(predict(knowledge({ names }))(line('TAXI STAND')).source).toBe('fallback');
	});
});

describe('leaving a line uncategorised', () => {
	it('does so when nothing fits', () => {
		expect(predict(knowledge())(out())).toEqual(fallback(amount(-100n)));
	});

	it('does so for a line with no words', () => {
		const names = [{ account: 'Expenses:Food', vector: axis(0) }];
		expect(predict(knowledge({ names }))(out([], null)).source).toBe('fallback');
	});

	it('files money out under expenses and money in under income', () => {
		expect(fallback(amount(-1n)).account).toBe('Expenses:Uncategorized');
		expect(fallback(amount(1n)).account).toBe('Income:Uncategorized');
	});
});

describe('classifying lines', () => {
	const options = {
		thresholds: { history: 0.15, spelled: 0.5, name: 0.35 },
		account: 'Assets:Bank',
		today,
		accounts: ['Assets:Bank', 'Expenses:Food', 'Expenses:Uncategorized'],
	};

	it('searches near each distinct line once, and never names a guessed account', () => {
		const lines = [
			{ amount: amount(-1n), description: 'swiggy' },
			{ amount: amount(-2n), description: 'SWIGGY' },
			{ amount: amount(-3n), description: '123456' },
		];
		const texts = textsOf({ ...options, lines });
		expect(texts.texts).not.toContain('expenses uncategorized');
		expect(texts.texts.slice(0, texts.searched)).toEqual(['swiggy']);

		const vectors = texts.texts.map((t) => (t === 'swiggy' ? axis(0) : axis(3)));
		expect(
			classify({ ...options, lines }, vectors, [[neighbour('Expenses:Food')]]).map((p) => [
				p.account,
				p.source,
			]),
		).toEqual([
			['Expenses:Food', 'history'],
			['Expenses:Food', 'history'],
			['Expenses:Uncategorized', 'fallback'],
		]);
	});
});
