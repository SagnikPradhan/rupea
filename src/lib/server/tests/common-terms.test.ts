import { Terms, TermsForm } from '#lib/shared/terms.ts';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

describe('the form for the terms of a liability', () => {
	const entries = [['kind', 'loan']];

	it('takes an account under Liabilities and one-line terms', () => {
		expect(
			v.safeParse(TermsForm, {
				account: ' Liabilities:Loans:Home ',
				entries: [[' rate ', ' 8.5% ']],
			}).output,
		).toEqual({ account: 'Liabilities:Loans:Home', entries: [['rate', '8.5%']] });
	});

	it.each(['Equity:Two Words', 'Bank', 'Liabilities:Two Words'])('refuses %s', (account) => {
		expect(v.safeParse(TermsForm, { account, entries }).success).toBe(false);
	});

	it.each([
		['a key with a capital', ['Rate', '8']],
		['an empty value', ['rate', '  ']],
		['a value over two lines', ['rate', '8\n2026-10-01 Sneak']],
	])('refuses %s', (_, entry) => {
		expect(v.safeParse(TermsForm, { account: 'Liabilities:Card', entries: [entry] }).success).toBe(
			false,
		);
	});
});

describe('reading terms by kind', () => {
	it('types a loan, reducing unless it says flat', () => {
		expect(
			v.parse(Terms, { kind: 'loan', rate: '8.5%', payment: '42000', due: '5', extra: 'x' }),
		).toEqual({ kind: 'loan', rate: 8.5, payment: '42000', due: 5, method: 'reducing' });
		expect(v.parse(Terms, { kind: 'loan', method: 'flat', tenure: '24' })).toMatchObject({
			method: 'flat',
			tenure: 24,
		});
	});

	it('types a card', () => {
		expect(
			v.parse(Terms, { kind: 'card', limit: '1,50,000', statement: '1', due: '20', rate: '42' }),
		).toEqual({
			kind: 'card',
			limit: '1,50,000',
			statement: 1,
			due: 20,
			rate: 42,
		});
	});

	it.each([
		['a kind it does not know', { kind: 'house' }],
		['no kind', { rate: '8' }],
		['a day past the month', { kind: 'loan', due: '32' }],
		['a rate that is not a number', { kind: 'loan', rate: 'high' }],
	])('says nothing for %s', (_, terms) => {
		expect(v.safeParse(Terms, terms).success).toBe(false);
	});
});
