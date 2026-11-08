import { LIABILITIES } from '#lib/shared/accounts.ts';
import type { Terms } from '#lib/shared/terms.ts';
import { byCodeUnit } from '#lib/shared/text.ts';
import type * as v from 'valibot';
import { isUnder, nameOf } from './accounts';

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
 * The payments that fall due in the thirty days from today: a loan's monthly
 * payment and what a card holds, on the next day of the month each is due.
 */
export const duesOf = (owed: Held[], set: Set[], today: string) => {
	const parents = new Set(owed.map((a) => a.parent));
	const held = Object.fromEntries(set.map((s) => [s.account.toLowerCase(), s.held]));
	const last = shifted(today, 30);

	return owed
		.filter((a) => !parents.has(a.account))
		.flatMap((a) => {
			const terms = held[a.account.toLowerCase()];
			const amount = Number(terms?.kind === 'loan' ? terms.payment?.replaceAll(',', '') : a.total);
			const due = terms?.due ? nextDue(today, terms.due) : '';

			return amount > 0 && due !== '' && due <= last
				? [{ key: a.account, label: nameOf(a.account), amount, due }]
				: [];
		})
		.toSorted((a, b) => byCodeUnit(a.due, b.due));
};

const nextDue = (today: string, day: number) => {
	const t = new Date(today);
	const here = dayOf(t.getUTCFullYear(), t.getUTCMonth(), day);
	return here >= today ? here : dayOf(t.getUTCFullYear(), t.getUTCMonth() + 1, day);
};

const dayOf = (year: number, month: number, day: number) => {
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return new Date(Date.UTC(year, month, Math.min(day, last))).toISOString().slice(0, 10);
};

const shifted = (d: string, n: number) =>
	new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
