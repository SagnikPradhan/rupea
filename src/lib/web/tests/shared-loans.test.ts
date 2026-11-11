import { describe, expect, it } from 'vitest';
import {
	type Loan,
	monthlyInterest,
	interestAhead,
	interestBehind,
} from '#lib/web/shared/loans.ts';
import { type Amount, parseAmount, toNumber } from '#lib/shared/amounts.ts';

const amount = (n: number) => parseAmount(String(n)) as Amount;

const reducing = { rate: amount(12), method: 'reducing', payment: amount(1000) } as const;
const flat = { rate: amount(12), method: 'flat', payment: amount(1000), months: 12 } as const;

/** How many payments clear the loan, or null when they never do. */
const left = (l: Loan, o: number) => {
	const a = interestAhead(l, amount(o));
	return a.clears ? a.interest.length : null;
};

describe('the interest a loan adds in a month', () => {
	it('charges a reducing loan on what it still owes', () => {
		expect(toNumber(monthlyInterest(reducing, amount(10000)))).toBeCloseTo(100);
	});

	it('is not capped by the payment', () => {
		expect(toNumber(monthlyInterest(reducing, amount(1_000_000)))).toBeCloseTo(10_000);
	});

	it('counts none for a loan that owes nothing or less', () => {
		expect(monthlyInterest(reducing, amount(0))).toBe(0n);
		expect(monthlyInterest(reducing, amount(-500))).toBe(0n);
		expect(monthlyInterest(flat, amount(0))).toBe(0n);
		expect(monthlyInterest(flat, amount(-500))).toBe(0n);
	});

	it('takes the same share of every payment of a flat loan', () => {
		expect(toNumber(monthlyInterest(flat, amount(500)))).toBeCloseTo(1000 * (0.12 / 1.12));
	});
});

describe('the interest ahead', () => {
	it('counts the payments a reducing loan takes to clear', () => {
		expect(left(reducing, 10000)).toBe(11);
	});

	it('charges each payment on what is still owed', () => {
		const [first, second] = interestAhead(reducing, amount(10000)).interest;

		expect(toNumber(first ?? amount(0))).toBeCloseTo(100);
		expect(toNumber(second ?? amount(0))).toBeCloseTo(91);
	});

	it('divides by the payment when the loan has no interest', () => {
		expect(left({ ...reducing, rate: amount(0) }, 2500)).toBe(3);
	});

	it('never clears when the payment does not cover the interest', () => {
		expect(left(reducing, 100_000)).toBeNull();
	});

	it('reads a loan that runs past a hundred years as never clearing', () => {
		expect(left(reducing, 99_990)).toBe(926);
		expect(left(reducing, 99_999.9)).toBeNull();
	});

	it('counts what a flat loan pays down each month', () => {
		expect(left(flat, 8000)).toBe(Math.ceil(8000 / (1000 - 1000 * (0.12 / 1.12))));
	});

	it('is none when nothing is owed', () => {
		expect(left(flat, -30000)).toBe(0);
	});

	it('never clears a loan with no payment', () => {
		expect(left({ ...reducing, payment: amount(0) }, 500)).toBeNull();
	});
});

describe('the interest behind', () => {
	it('works back from what is owed after the last payment, oldest first', () => {
		const interest = interestBehind(reducing, amount(8191), [amount(1000), amount(1000)]);

		expect(interest.map(toNumber)).toEqual([expect.closeTo(100, 1), expect.closeTo(91, 1)]);
	});

	it('never counts more interest than the loan payment', () => {
		expect(interestBehind(reducing, amount(1_000_000), [amount(5000)])).toEqual([amount(1000)]);
	});

	it('never counts more interest than the amount paid', () => {
		expect(interestBehind(flat, amount(500), [amount(50)])).toEqual([amount(50)]);
	});

	it('takes the same share of each flat payment, the last one too', () => {
		const interest = interestBehind(flat, amount(0), [amount(1000), amount(1000)]);

		expect(interest.map(toNumber)).toEqual([
			expect.closeTo(1000 * (0.12 / 1.12)),
			expect.closeTo(1000 * (0.12 / 1.12)),
		]);
	});

	it('leaves the balance alone across payments that were all interest', () => {
		expect(interestBehind(reducing, amount(1_000_000), [amount(1000), amount(1000)])).toEqual([
			amount(1000),
			amount(1000),
		]);
	});
});
