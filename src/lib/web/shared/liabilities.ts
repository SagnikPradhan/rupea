import { LIABILITIES } from '#lib/shared/accounts.ts';
import type { Bucket } from '#lib/shared/dates.ts';
import type { Terms } from '#lib/shared/terms.ts';
import { byCodeUnit } from '#lib/shared/text.ts';
import type * as v from 'valibot';
import { isUnder, nameOf } from './accounts';
import {
	type Loan,
	interestPaid,
	monthlyInterest,
	loanOf,
	owedBefore,
	paymentOf,
	paymentsLeft,
} from './interest';

/** The first day of the bucket a day falls in. */
const STARTS: Record<Bucket, (d: string) => string> = {
	day: (d) => d,
	month: (d) => `${d.slice(0, 7)}-01`,
	year: (d) => `${d.slice(0, 4)}-01-01`,
};

const ZERO = /^-?0*(\.0*)?$/;

type Held = { account: string; parent: string | null; total: string; unpriced: number };

type Termed = { account: string; held: v.InferOutput<typeof Terms> | null };

type Moved = { account: string; amount: string };

/**
 * The accounts under Liabilities, with each total turned from a balance into
 * what is owed.
 */
export const owedOf = (h: Held[]) =>
	h.filter((a) => isUnder(a.account, LIABILITIES)).map((a) => ({ ...a, total: flipped(a.total) }));

const flipped = (t: string) => {
	if (ZERO.test(t)) return t;
	return t.startsWith('-') ? t.slice(1) : `-${t}`;
};

/**
 * A row for each account with what it owes and paid down over the period;
 * settled ones that did not move are left out.
 */
export const rowsOf = (owed: Held[], moved: Moved[], settled: boolean, set: Termed[] = []) => {
	const parents = new Set(owed.map((a) => a.parent));
	const paid = Object.fromEntries(moved.map((m) => [m.account, m.amount]));
	const lines = Object.fromEntries(set.map((s) => [s.account.toLowerCase(), s]));
	const rows = owed
		.filter((a) => a.parent !== null)
		.map((a) => ({
			account: a.account,
			parent: a.parent,
			leaf: !parents.has(a.account),
			owed: a.total,
			paid: paid[a.account] ?? '0',
			unpriced: a.unpriced,
			...columnsOf(lines[a.account.toLowerCase()]),
		}));

	return settled ? rows : rows.filter((r) => !ZERO.test(r.owed) || !ZERO.test(r.paid));
};

const columnsOf = (s: Termed | undefined) => ({
	set: s !== undefined,
	rate: s?.held?.rate ?? null,
	monthly: paymentOf(s?.held)?.toString() ?? null,
	due: s?.held?.due ?? null,
});

/**
 * The payments due from today to the end of the period, on each due day of the
 * month.
 */
export const duesOf = (owed: Held[], set: Termed[], today: string, to: string) => {
	const months = (Number(to.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + 12;

	return leavesOf(owed, set).flatMap((a) => {
		const amount = a.terms?.kind === 'loan' ? (paymentOf(a.terms) ?? 0) : Number(a.total);
		const day = a.terms?.due ?? 0;
		const loan = a.terms?.kind === 'loan' ? loanOf(a.terms) : null;
		const left = loan === null ? null : paymentsLeft(loan, Number(a.total));

		return amount > 0 && day > 0
			? daysDue(today, day, months)
					.slice(0, left ?? undefined)
					.filter((d) => d <= to)
					.map((d) => ({ key: a.account, label: nameOf(a.account), amount, due: d }))
			: [];
	});
};

/**
 * A line for each loan or card with a pin for each payment made or due, and a
 * loan's pins say how much is interest.
 */
export const linesOf = (
	owed: Held[],
	paid: { account: string; bucket: string; amount: string }[],
	dues: { key: string; amount: number; due: string }[],
	bucket: Bucket,
	set: Termed[] = [],
) => {
	const pins = Object.groupBy(
		[
			...paid
				.filter((p) => Number(p.amount) > 0)
				.map((p) => ({ key: p.account, at: p.bucket, amount: Number(p.amount), past: true })),
			...dues.map((d) => ({
				key: d.key,
				at: STARTS[bucket](d.due),
				amount: d.amount,
				past: false,
			})),
		],
		(p) => p.key,
	);

	return leavesOf(owed, set)
		.map((a) => ({
			key: a.account,
			label: nameOf(a.account),
			pins: splitOf(
				bucket === 'year' ? null : loanOf(a.terms),
				Number(a.total),
				(pins[a.account] ?? []).toSorted((x, y) => byCodeUnit(x.at, y.at)),
			),
		}))
		.filter((l) => l.pins.length > 0)
		.toSorted((x, y) => byCodeUnit(x.label, y.label));
};

/**
 * About a month's loan interest, null when an owing debt other than a card
 * cannot be estimated, and the month the last loan clears, also null when a
 * loan never clears.
 */
export const estimatesOf = (owed: Held[], set: Termed[], on: string) => {
	const debts = leavesOf(owed, set).filter((a) => a.terms?.kind !== 'card' && Number(a.total) > 0);
	const loans = debts.flatMap((a) => {
		const loan = loanOf(a.terms);
		const due = a.terms?.kind === 'loan' ? a.terms.due : undefined;
		return loan === null ? [] : [{ loan, owed: Number(a.total), due }];
	});

	if (loans.length === 0 || loans.length < debts.length) return { interest: null, clears: null };

	const ends = loans.map((l) => monthsToClear(l, on));

	return {
		interest: loans.reduce((t, l) => t + monthlyInterest(l.loan, l.owed), 0),
		clears: ends.includes(null) ? null : monthsAfter(on, Math.max(...ends.map(Number))),
	};
};

const monthsToClear = (l: { loan: Loan; owed: number; due: number | undefined }, on: string) => {
	const left = paymentsLeft(l.loan, l.owed);
	const thisMonth = l.due !== undefined && daysDue(on, l.due, 1).length > 0;

	return left === null ? null : left - (thisMonth ? 1 : 0);
};

const leavesOf = (owed: Held[], set: Termed[]) => {
	const parents = new Set(owed.map((a) => a.parent));
	const held = Object.fromEntries(set.map((s) => [s.account.toLowerCase(), s.held]));

	return owed
		.filter((a) => !parents.has(a.account))
		.map((a) => ({ ...a, terms: held[a.account.toLowerCase()] }));
};

const splitOf = (
	loan: Loan | null,
	owed: number,
	pins: { key: string; at: string; amount: number; past: boolean }[],
) => {
	if (loan === null) return pins.map((p) => ({ ...p, interest: 0 }));

	const balance = { back: owed, ahead: owed };

	const past = pins
		.filter((p) => p.past)
		.toReversed()
		.map((p) => {
			balance.back = owedBefore(loan, balance.back, p.amount);
			return { ...p, interest: interestPaid(loan, balance.back, p.amount) };
		})
		.toReversed();
	const future = pins
		.filter((p) => !p.past)
		.map((p) => {
			const interest = interestPaid(loan, balance.ahead, p.amount);
			balance.ahead -= p.amount - interest;
			return { ...p, interest };
		});

	return [...past, ...future];
};

const monthsAfter = (d: string, n: number) =>
	Temporal.PlainDate.from(d).with({ day: 1 }).add({ months: n }).toString();

const daysDue = (today: string, day: number, months: number) => {
	const first = new Date(today);

	return Array.from({ length: months }, (_, k) =>
		dayOf(first.getUTCFullYear(), first.getUTCMonth() + k, day),
	).filter((d) => d >= today);
};

const dayOf = (year: number, month: number, day: number) => {
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return new Date(Date.UTC(year, month, Math.min(day, last))).toISOString().slice(0, 10);
};
