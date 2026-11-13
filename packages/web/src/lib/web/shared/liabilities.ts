import { LIABILITIES } from '@rupea/shared/accounts.ts';
import { type Amount, ZERO, parseAmount, sum } from '@rupea/shared/amounts.ts';
import { type Bucket, type Span, bucketOf, monthlyDaysIn } from '@rupea/shared/dates.ts';
import type { Terms } from '@rupea/shared/terms.ts';
import { byCodeUnit } from '@rupea/shared/text.ts';
import type * as v from 'valibot';
import { isUnder, nameOf } from './accounts';
import * as Loans from './loans';

type Balance = { account: string; parent: string | null; total: Amount; unpriced: number };

/**
 * An account's terms as the server lists them; held is what they say on the
 * day, if they read.
 */
type ListedTerms = { account: string; held: v.InferOutput<typeof Terms> | null };

/** A liability: what it owes, and how it is paid when it has terms. */
export type Debt = {
	account: string;
	parent: string | null;
	/** No account sits under it, so it is the one that takes payments. */
	leaf: boolean;
	owed: Amount;
	unpriced: number;
	/** It has terms written, even ones that do not read. */
	setUp: boolean;
	kind: 'loan' | 'card' | null;
	rate: number | null;
	payment: Amount | null;
	/** The day of the month a payment falls due. */
	due: number | null;
	loan: Loans.Loan | null;
};

type Paid = { account: string; bucket: Temporal.PlainDate; inflow: Amount };

type Due = { account: string; on: Temporal.PlainDate; amount: Amount; interest: Amount };

/**
 * The accounts under Liabilities, each total turned from a balance into what is
 * owed.
 */
export const accountsIn = (b: Balance[]) =>
	b
		.filter((a) => isUnder(a.account, LIABILITIES))
		.map((a) => ({ ...a, total: -a.total as Amount }));

/**
 * Each liability with its terms read; accounts match their terms whatever the
 * case.
 */
export const debtsFrom = (owed: Balance[], terms: ListedTerms[]): Debt[] => {
	const parents = new Set(owed.map((a) => a.parent));
	const listed = Object.fromEntries(terms.map((t) => [t.account.toLowerCase(), t]));

	return owed.map((a) => {
		const own = listed[a.account.toLowerCase()];
		return {
			account: a.account,
			parent: a.parent,
			leaf: !parents.has(a.account),
			owed: a.total,
			unpriced: a.unpriced,
			setUp: own !== undefined,
			...termsFrom(own?.held ?? null),
		};
	});
};

/**
 * A row for each debt but the top one, with what it drew and paid over the
 * period; settled ones that did not move are left out unless asked for.
 */
export const rowsFor = (
	debts: Debt[],
	moved: { account: string; inflow: Amount; outflow: Amount }[],
	settled: boolean,
) => {
	const flows = Object.fromEntries(moved.map((m) => [m.account, m]));
	const rows = debts
		.filter((d) => d.parent !== null)
		.map((d) => ({
			...d,
			drawn: flows[d.account]?.outflow ?? ZERO,
			paid: flows[d.account]?.inflow ?? ZERO,
		}));

	return settled ? rows : rows.filter((r) => [r.owed, r.drawn, r.paid].some((x) => x !== 0n));
};

/**
 * The payments falling due on a debt in a span, each with the interest in it: a
 * card pays what it owes, and a loan its payment until it clears.
 */
export const duesOn = (debt: Debt, span: Span) => {
	const amount = debt.kind === 'loan' ? (debt.payment ?? ZERO) : debt.owed;
	if (!debt.leaf || debt.due === null || amount <= 0n) return [];

	const ahead = debt.loan === null ? null : Loans.scheduleFor(debt.loan, debt.owed);
	const days = monthlyDaysIn(span, debt.due);
	const payments = ahead?.clears ? ahead.interest.length : days.length;

	return days.slice(0, payments).map((on, i) => ({
		account: debt.account,
		on,
		amount,
		interest: ahead?.interest[i] ?? ZERO,
	}));
};

/**
 * A line for each debt with a pin for each payment made or due. A loan's pins
 * say how much is interest, unless a pin spans a whole year.
 */
export const linesFor = (debts: Debt[], paid: Paid[], dues: Due[], bucket: Bucket) => {
	const made = Object.groupBy(
		paid.filter((p) => p.inflow > 0n),
		(p) => p.account,
	);
	const due = Object.groupBy(dues, (d) => d.account);

	return debts
		.filter((d) => d.leaf)
		.map((d) => ({
			key: d.account,
			label: nameOf(d.account),
			pins: [
				...pastPinsFor(d, made[d.account] ?? [], bucket),
				...futurePinsFor(due[d.account] ?? [], bucket),
			],
		}))
		.filter((l) => l.pins.length > 0)
		.toSorted((x, y) => byCodeUnit(x.label, y.label));
};

/** What an account owes, or nothing when it is not one of the debts. */
export const owedOn = (d: Debt[], a: string) => d.find((x) => x.account === a)?.owed ?? ZERO;

/** How many payments on the lines were made, and how many are still to fall due. */
export const paymentsOn = (lines: { pins: { past: boolean }[] }[]) => {
	const pins = lines.flatMap((l) => l.pins);
	const made = pins.filter((p) => p.past).length;

	return { made, due: pins.length - made };
};

/**
 * About a month's interest on the loans, or null while a debt other than a card
 * owes with no loan to estimate it by.
 */
export const monthlyInterestOn = (debts: Debt[]) => {
	const loans = loansIn(debts);
	return loans === null ? null : sum(loans.map((l) => Loans.monthlyInterestOn(l.loan, l.owed)));
};

/**
 * The month the last loan is paid off, or null when one never is or a debt
 * other than a card owes with no loan to estimate it by.
 */
export const payoffOf = (debts: Debt[], on: Temporal.PlainDate) => {
	const loans = loansIn(debts);
	if (loans === null) return null;

	const months = loans.map((l) => remainingMonthsOf(l, on));
	if (months.includes(null)) return null;

	return on.with({ day: 1 }).add({ months: Math.max(...months.map(Number)) });
};

/** What terms say about paying, with the payment and the loan read as amounts. */
const termsFrom = (terms: v.InferOutput<typeof Terms> | null) => {
	const payment =
		terms?.kind === 'loan' && terms.payment !== undefined ? parseAmount(terms.payment) : null;

	return {
		kind: terms?.kind ?? null,
		rate: terms?.rate ?? null,
		payment,
		due: terms?.due ?? null,
		loan: loanFrom(terms, payment),
	};
};

/**
 * The loan some terms describe, or null when a rate, payment or flat loan's
 * months are missing.
 */
const loanFrom = (
	terms: v.InferOutput<typeof Terms> | null,
	payment: Amount | null,
): Loans.Loan | null => {
	const rate =
		terms?.kind === 'loan' && terms.rate !== undefined ? parseAmount(String(terms.rate)) : null;
	if (terms?.kind !== 'loan' || rate === null || payment === null) return null;
	if (terms.method === 'flat' && terms.tenure === undefined) return null;

	return { rate, method: terms.method, payment, months: terms.tenure };
};

const pastPinsFor = (debt: Debt, paid: Paid[], bucket: Bucket) => {
	const oldestFirst = paid.toSorted((x, y) => Temporal.PlainDate.compare(x.bucket, y.bucket));
	const interest =
		debt.loan === null || bucket === 'year'
			? []
			: Loans.paidInterestOn(
					debt.loan,
					debt.owed,
					oldestFirst.map((p) => p.inflow),
				);

	return oldestFirst.map((p, i) => ({
		at: p.bucket,
		amount: p.inflow,
		past: true,
		interest: interest[i] ?? ZERO,
	}));
};

const futurePinsFor = (dues: Due[], bucket: Bucket) =>
	dues.map((d) => ({
		at: bucketOf[bucket](d.on),
		amount: d.amount,
		past: false,
		interest: bucket === 'year' ? ZERO : d.interest,
	}));

/**
 * The loans of the debts that owe, or null when none owes or one other than a
 * card owes with no loan to estimate it by.
 */
const loansIn = (debts: Debt[]) => {
	const owing = debts.filter((d) => d.leaf && d.kind !== 'card' && d.owed > 0n);
	const loans = owing.flatMap((d) =>
		d.loan === null ? [] : [{ loan: d.loan, owed: d.owed, due: d.due }],
	);

	return loans.length === 0 || loans.length < owing.length ? null : loans;
};

/** The months after this one that the last payment falls in. */
const remainingMonthsOf = (
	l: { loan: Loans.Loan; owed: Amount; due: number | null },
	on: Temporal.PlainDate,
) => {
	const ahead = Loans.scheduleFor(l.loan, l.owed);
	const dueThisMonth = l.due !== null && Math.min(l.due, on.daysInMonth) >= on.day;

	const payments = ahead.interest.length;

	return ahead.clears ? payments - (dueThisMonth ? 1 : 0) : null;
};
