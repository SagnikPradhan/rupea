import { LIABILITIES } from '#lib/shared/accounts.ts';
import { byCodeUnit } from '#lib/shared/text.ts';
import { Terms } from '#lib/shared/terms.ts';
import * as v from 'valibot';
import { isUnder, nameOf } from './accounts';

const ZERO = /^-?0*(\.0*)?$/;

type Held = { account: string; parent: string | null; total: string; unpriced: number };

type Moved = { account: string; amount: string };

type Setup = { account: string; since: string | null; terms: Record<string, string[]> };

type Payment = { account: string; bucket: string; amount: string };

/**
 * What each account's A * line says, read by its kind; an account whose line
 * does not read as a loan or a card has none.
 */
export const termsOf = (lines: Setup[]) =>
	Object.fromEntries(
		lines
			.filter((s) => s.since === null)
			.flatMap((s) => {
				const read = v.safeParse(
					Terms,
					Object.fromEntries(Object.entries(s.terms).map(([k, [x]]) => [k, x])),
				);
				return read.success ? [[s.account, read.output] as const] : [];
			}),
	);

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
export const rowsOf = (
	owed: Held[],
	moved: Moved[],
	settled: boolean,
	terms: Record<string, v.InferOutput<typeof Terms>> = {},
) => {
	const paid = Object.fromEntries(moved.map((m) => [m.account, m.amount]));
	const rows = owed
		.filter((a) => a.parent !== null)
		.map((a) => ({
			account: a.account,
			parent: a.parent,
			owed: a.total,
			paid: paid[a.account] ?? '0',
			unpriced: a.unpriced,
			...columnsOf(terms[a.account]),
		}));

	return settled ? rows : rows.filter((r) => !ZERO.test(r.owed) || !ZERO.test(r.paid));
};

const columnsOf = (t: v.InferOutput<typeof Terms> | undefined) => ({
	set: t !== undefined,
	rate: (t?.kind === 'card' ? t.apr : t?.rate) ?? null,
	monthly: (t?.kind === 'loan' ? t.payment?.replaceAll(',', '') : undefined) ?? null,
	due: t?.due ?? null,
});

/**
 * For each account that holds a debt, a circle for every bucket it was paid
 * down in; the groups over them are left out, as are buckets where it grew.
 */
export const linesOf = (payments: Payment[], owed: Held[]) => {
	const parents = new Set(owed.map((a) => a.parent));
	const debts = new Set(owed.filter((a) => !parents.has(a.account)).map((a) => a.account));
	const paid = payments.filter((p) => debts.has(p.account) && Number(p.amount) > 0);
	const byAccount = Object.groupBy(paid, (p) => p.account);

	return Object.keys(byAccount)
		.toSorted(byCodeUnit)
		.map((account) => ({
			key: account,
			label: nameOf(account),
			circles: (byAccount[account] ?? []).map((p) => ({
				bucket: p.bucket,
				paid: Number(p.amount),
			})),
		}));
};
