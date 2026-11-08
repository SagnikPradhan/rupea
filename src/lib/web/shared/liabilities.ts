import { LIABILITIES } from '#lib/shared/accounts.ts';
import type { Bucket } from '#lib/shared/dates.ts';
import type { Terms } from '#lib/shared/terms.ts';
import { byCodeUnit } from '#lib/shared/text.ts';
import type * as v from 'valibot';
import { isUnder, nameOf } from './accounts';

/** The first day of the bucket a day falls in. */
const STARTS: Record<Bucket, (d: string) => string> = {
	day: (d) => d,
	month: (d) => `${d.slice(0, 7)}-01`,
	year: (d) => `${d.slice(0, 4)}-01-01`,
};

const ZERO = /^-?0*(\.0*)?$/;

type Held = { account: string; parent: string | null; total: string; unpriced: number };

type Set = { account: string; held: v.InferOutput<typeof Terms> | null };

type Moved = { account: string; amount: string };

/**
 * The accounts under Liabilities, each total turned from a balance into what is
 * owed, so an account in credit owes less than nothing.
 */
export const owedOf = (h: Held[]) =>
	h.filter((a) => isUnder(a.account, LIABILITIES)).map((a) => ({ ...a, total: flipped(a.total) }));

const flipped = (t: string) => {
	if (ZERO.test(t)) return t;
	return t.startsWith('-') ? t.slice(1) : `-${t}`;
};

/**
 * A row for each account under the root with what it owes and what it paid down
 * over the period; settled accounts that did not move are left out unless asked
 * for.
 */
export const rowsOf = (owed: Held[], moved: Moved[], settled: boolean, set: Set[] = []) => {
	const paid = Object.fromEntries(moved.map((m) => [m.account, m.amount]));
	const lines = Object.fromEntries(set.map((s) => [s.account.toLowerCase(), s]));
	const rows = owed
		.filter((a) => a.parent !== null)
		.map((a) => ({
			account: a.account,
			parent: a.parent,
			owed: a.total,
			paid: paid[a.account] ?? '0',
			unpriced: a.unpriced,
			...columnsOf(lines[a.account.toLowerCase()]),
		}));

	return settled ? rows : rows.filter((r) => !ZERO.test(r.owed) || !ZERO.test(r.paid));
};

const columnsOf = (s: Set | undefined) => ({
	set: s !== undefined,
	rate: s?.held?.rate ?? null,
	monthly: (s?.held?.kind === 'loan' ? s.held.payment?.replaceAll(',', '') : undefined) ?? null,
	due: s?.held?.due ?? null,
});

/**
 * The payments that fall due from today to the end of the period: a loan's
 * monthly payment and what a card holds, on its due day of each month.
 */
export const duesOf = (owed: Held[], set: Set[], today: string, to: string) => {
	const parents = new Set(owed.map((a) => a.parent));
	const held = Object.fromEntries(set.map((s) => [s.account.toLowerCase(), s.held]));
	const first = new Date(today);
	const months = (Number(to.slice(0, 4)) - first.getUTCFullYear()) * 12 + 12;

	return owed
		.filter((a) => !parents.has(a.account))
		.flatMap((a) => {
			const terms = held[a.account.toLowerCase()];
			const amount = Number(terms?.kind === 'loan' ? terms.payment?.replaceAll(',', '') : a.total);
			const day = terms?.due ?? 0;

			return amount > 0 && day > 0
				? Array.from({ length: months }, (_, k) =>
						dayOf(first.getUTCFullYear(), first.getUTCMonth() + k, day),
					)
						.filter((d) => d >= today && d <= to)
						.map((d) => ({ key: a.account, label: nameOf(a.account), amount, due: d }))
				: [];
		});
};

/**
 * A line for each loan or card with payments, holding a pin for each payment
 * made in the period and each one still to fall due, each on the first day of
 * its bucket.
 */
export const linesOf = (
	owed: Held[],
	paid: { account: string; bucket: string; amount: string }[],
	dues: { key: string; amount: number; due: string }[],
	bucket: Bucket,
) => {
	const parents = new Set(owed.map((a) => a.parent));
	const pins = [
		...paid
			.filter((p) => Number(p.amount) > 0)
			.map((p) => ({ key: p.account, at: p.bucket, amount: Number(p.amount), past: true })),
		...dues.map((d) => ({ key: d.key, at: STARTS[bucket](d.due), amount: d.amount, past: false })),
	];

	return owed
		.filter((a) => !parents.has(a.account))
		.map((a) => ({
			key: a.account,
			label: nameOf(a.account),
			pins: pins.filter((p) => p.key === a.account).toSorted((a, b) => byCodeUnit(a.at, b.at)),
		}))
		.filter((l) => l.pins.length > 0)
		.toSorted((a, b) => byCodeUnit(a.label, b.label));
};

const dayOf = (year: number, month: number, day: number) => {
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return new Date(Date.UTC(year, month, Math.min(day, last))).toISOString().slice(0, 10);
};
