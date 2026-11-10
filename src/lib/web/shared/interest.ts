import type { Terms } from '#lib/shared/terms.ts';
import type * as v from 'valibot';

export type Loan = {
	rate: number;
	method: 'reducing' | 'flat';
	payment: number;
	tenure?: number | undefined;
};

type HeldTerms = v.InferOutput<typeof Terms> | null | undefined;

/** The monthly payment of a loan, or null when it has none. */
export const paymentOf = (t: HeldTerms) => {
	if (t?.kind !== 'loan' || t.payment === undefined) return null;

	return Number(t.payment.replaceAll(',', ''));
};

/**
 * The loan behind some terms, or null when a rate, payment or flat tenure is
 * missing.
 */
export const loanOf = (t: HeldTerms): Loan | null => {
	const payment = paymentOf(t);
	if (t?.kind !== 'loan' || t.rate === undefined || payment === null) return null;
	if (t.method === 'flat' && t.tenure === undefined) return null;

	return { rate: t.rate, method: t.method, payment, tenure: t.tenure };
};

/** About the interest a loan adds in a month. */
export const monthlyInterest = (loan: Loan, owed: number) => {
	const left = Math.max(owed, 0);

	if (loan.method === 'reducing') return (left * loan.rate) / 1200;

	const total = (loan.rate * (loan.tenure ?? 0)) / 1200;
	return left > 0 ? (loan.payment * total) / (1 + total) : 0;
};

/** About the interest in a payment of the amount, never more than the payment. */
export const interestPaid = (loan: Loan, owed: number, amount: number) => {
	const accrued = monthlyInterest(loan, owed);
	return Math.min(accrued, loan.payment, amount);
};

/** About what was owed before a payment took the balance down to the one given. */
export const owedBefore = (loan: Loan, after: number, amount: number) => {
	if (loan.method === 'flat') return after + amount - interestPaid(loan, after + amount, amount);

	const cap = Math.min(loan.payment, amount);
	const monthly = loan.rate / 1200;
	const uncapped = (after + amount) / (1 + monthly);

	return uncapped * monthly >= cap ? after + amount - cap : uncapped;
};

/**
 * About how many more payments clear what is owed, or null when they never
 * will.
 */
export const paymentsLeft = (loan: Loan, owed: number) => {
	if (loan.payment <= 0) return null;
	if (owed <= 0) return 0;
	if (loan.method === 'flat') return Math.ceil(owed / (loan.payment - monthlyInterest(loan, owed)));

	const monthly = loan.rate / 1200;
	if (monthly === 0) return Math.ceil(owed / loan.payment);
	if (loan.payment <= owed * monthly) return null;

	return Math.ceil(-Math.log(1 - (owed * monthly) / loan.payment) / Math.log(1 + monthly));
};
