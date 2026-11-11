import { AMOUNT_UNIT, type Amount, ZERO, divide, min, multiply } from '#lib/shared/amounts.ts';

/** A yearly percent spread over twelve months. */
const MONTHS_PERCENT = 1200n;

/** The most payments counted; a loan that runs longer reads as never clearing. */
const MOST_PAYMENTS = 1200;

/**
 * A loan paid monthly: its yearly percent rate, its payment, and a flat loan's
 * months.
 */
export type Loan = {
	rate: Amount;
	method: 'reducing' | 'flat';
	payment: Amount;
	months?: number | undefined;
};

/**
 * About the interest a month adds to what a loan owes. A reducing loan charges
 * its rate on what is owed; a flat loan takes the same share of every payment.
 */
export const monthlyInterest = (loan: Loan, owed: Amount) => {
	if (owed <= 0n) return ZERO;
	if (loan.method === 'reducing') return (multiply(owed, loan.rate) / MONTHS_PERCENT) as Amount;

	const total = ((loan.rate * BigInt(loan.months ?? 0)) / MONTHS_PERCENT) as Amount;
	return divide(multiply(loan.payment, total), (AMOUNT_UNIT + total) as Amount);
};

/**
 * The interest in each payment still to make, one per payment until what is
 * owed is paid off, and whether it ever is.
 */
export const interestAhead = (loan: Loan, owed: Amount) => {
	const balance = { owed };
	const interest: Amount[] = [];

	while (balance.owed > 0n && interest.length < MOST_PAYMENTS) {
		const charged = interestIn(loan, balance.owed, loan.payment);
		balance.owed = (balance.owed - loan.payment + charged) as Amount;
		interest.push(charged);
	}

	return { interest, clears: balance.owed <= 0n };
};

/**
 * The interest in each payment made, oldest first, worked back from what is
 * owed after the last.
 */
export const interestBehind = (loan: Loan, owed: Amount, paid: Amount[]) => {
	const balance = { owed };

	return paid
		.toReversed()
		.map((p) => {
			balance.owed = owedBefore(loan, balance.owed, p);
			return interestIn(loan, balance.owed, p);
		})
		.toReversed();
};

/**
 * About the interest in one payment, never more than the loan's payment or the
 * payment.
 */
const interestIn = (l: Loan, o: Amount, p: Amount) => min(min(monthlyInterest(l, o), l.payment), p);

/**
 * About what was owed before a payment brought it down to what is owed after;
 * gross is that plus the month's interest.
 */
const owedBefore = (loan: Loan, after: Amount, paid: Amount) => {
	const gross = (after + paid) as Amount;
	if (loan.method === 'flat') return (gross - interestIn(loan, gross, paid)) as Amount;

	const cap = min(loan.payment, paid);
	const rate = (loan.rate / MONTHS_PERCENT) as Amount;
	const owed = divide(gross, (AMOUNT_UNIT + rate) as Amount);

	return multiply(owed, rate) >= cap ? ((gross - cap) as Amount) : owed;
};
