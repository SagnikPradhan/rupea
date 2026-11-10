import { describe, expect, it } from 'vitest';
import {
	interestPaid,
	monthlyInterest,
	loanOf,
	owedBefore,
	paymentsLeft,
} from '#lib/web/shared/interest.ts';

const reducing = { rate: 12, method: 'reducing', payment: 1000 } as const;
const flat = { rate: 12, method: 'flat', payment: 1000, tenure: 12 } as const;

describe('the loan behind some terms', () => {
	it('needs a loan with a rate and a payment', () => {
		expect(loanOf({ kind: 'card', limit: '5000' })).toBeNull();
		expect(loanOf({ kind: 'loan', method: 'reducing', rate: 9 })).toBeNull();
		expect(loanOf({ kind: 'loan', method: 'reducing', payment: '1,000' })).toBeNull();
		expect(loanOf(null)).toBeNull();
	});

	it('needs the months of a flat loan', () => {
		expect(loanOf({ kind: 'loan', method: 'flat', rate: 9, payment: '1,000' })).toBeNull();
	});

	it('reads the payment without its commas', () => {
		expect(
			loanOf({ kind: 'loan', method: 'flat', rate: 9, payment: '12,500', tenure: 24 }),
		).toEqual({
			rate: 9,
			method: 'flat',
			payment: 12500,
			tenure: 24,
		});
	});
});

describe('the interest a loan adds in a month', () => {
	it('charges a reducing loan on what it still owes', () => {
		expect(monthlyInterest(reducing, 10000)).toBeCloseTo(100);
	});

	it('is not capped by the payment', () => {
		expect(monthlyInterest(reducing, 1_000_000)).toBeCloseTo(10_000);
	});

	it('counts none for a loan that owes nothing or less', () => {
		expect(monthlyInterest(reducing, 0)).toBe(0);
		expect(monthlyInterest(reducing, -500)).toBe(0);
		expect(monthlyInterest(flat, 0)).toBe(0);
		expect(monthlyInterest(flat, -500)).toBe(0);
	});

	it('takes the same share of every payment of a flat loan', () => {
		expect(monthlyInterest(flat, 500)).toBeCloseTo(1000 * (0.12 / 1.12));
	});
});

describe('the interest in a payment', () => {
	it('never counts more interest than the payment', () => {
		expect(interestPaid(reducing, 1_000_000, 5000)).toBe(1000);
	});

	it('never counts more interest than the amount paid', () => {
		expect(interestPaid(flat, 500, 50)).toBe(50);
	});
});

describe('what was owed before a payment', () => {
	it('adds back only the part of a reducing payment that was not interest', () => {
		const before = owedBefore(reducing, 9100, 1000);

		expect(before).toBeCloseTo(10000);
		expect(before - 1000 + monthlyInterest(reducing, before)).toBeCloseTo(9100);
	});

	it('adds back the whole payment less the same interest for a flat loan', () => {
		expect(owedBefore(flat, 500, 1000)).toBeCloseTo(500 + 1000 - 1000 * (0.12 / 1.12));
	});

	it('agrees with the interest of the last flat payment that clears the loan', () => {
		const before = owedBefore(flat, 0, 1000);

		expect(before).toBeCloseTo(1000 - interestPaid(flat, before, 1000));
	});

	it('adds back a payment that was all interest as nothing', () => {
		expect(owedBefore(reducing, 1_000_000, 1000)).toBe(1_000_000);
	});
});

describe('the payments left', () => {
	it('counts the months a reducing loan takes to clear', () => {
		expect(paymentsLeft(reducing, 10000)).toBe(11);
	});

	it('divides by the payment when the loan has no interest', () => {
		expect(paymentsLeft({ ...reducing, rate: 0 }, 2500)).toBe(3);
	});

	it('says never when the payment does not cover the interest', () => {
		expect(paymentsLeft(reducing, 100_000)).toBeNull();
	});

	it('counts what a flat loan pays down each month', () => {
		expect(paymentsLeft(flat, 8000)).toBe(Math.ceil(8000 / (1000 - 1000 * (0.12 / 1.12))));
	});

	it('is none when nothing is owed', () => {
		expect(paymentsLeft(flat, -30000)).toBe(0);
	});

	it('cannot tell for a loan with no payment', () => {
		expect(paymentsLeft({ ...reducing, payment: 0 }, 500)).toBeNull();
	});
});
