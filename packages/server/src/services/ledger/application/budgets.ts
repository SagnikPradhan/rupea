import { consistently } from '#lib/server/db/read-only.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { errAsync, inOrder, ResultAsync } from '#lib/server/shared/result/result.ts';
import { findText, writeText } from '#lib/server/shared/storage/storage.ts';
import { fault } from '@rupea/shared/errors.ts';
import * as DB from '../adapters/database';
import { sum, type Amount } from '../domain/amounts';
import { budgetsIn, entriesIn, setBudget, type BudgetOn } from '../domain/budgets';
import type { Row } from '../domain/deltas';
import { idsIn } from '../domain/tree';
import type { Ledger } from '../domain/types';
import * as Deltas from './deltas';
import { MAIN, openFolder, readingOf } from './ledger';
import { reindex } from './sync';

const SPANS_AT_ONCE = 4;

type ListBudgetsOptions = { ledger: Ledger; from: Temporal.PlainDate; to: Temporal.PlainDate };

/**
 * Each account's budget over a range, its limits added up over the periods the
 * range touches, with what it and the accounts under it spent in those periods,
 * and what is left of the limit. The range starts no earlier than the ledger's
 * first day. A budget on an account the ledger has no postings for has spent
 * nothing. Fails for a range that runs backwards.
 */
export const listBudgets = ({ ledger, from, to }: ListBudgetsOptions) =>
	consistently(() => {
		const reversed = Deltas.reversalOf({ from, to });
		if (reversed) return errAsync(reversed);

		return ResultAsync.combine([
			DB.listBudgetLines(ledger.id),
			Deltas.findShared(ledger.id),
			DB.findFirstDay(ledger.id),
		]).andThen(([lines, shared, first]) => {
			const budgets = withContext('config')((c) =>
				budgetsIn(lines, { from, to, first, dateFormats: c.ledger.dateFormats }),
			);

			return spendingIn(ledger, { budgets, shared });
		});
	});

type SpendingInOptions = { budgets: BudgetOn[]; shared: Deltas.Shared };

const spendingIn = (ledger: Ledger, { budgets, shared }: SpendingInOptions) => {
	const known = budgets.filter((b) => idsIn(shared.tree, b.account).length > 0);
	const batches = chunks(spansOf(known), SPANS_AT_ONCE).map(
		(w) => () => ResultAsync.combine(w.map((s) => readRows(ledger, { span: s, shared }))),
	);

	return inOrder(batches)
		.map((d) => d.flat())
		.map((d) => ({
			succeeded: budgets.map((b) => spendingOf(b, rowsFor(d, b))),
			failed: shared.failed,
		}));
};

type Span = { from: Temporal.PlainDate; to: Temporal.PlainDate; accounts: string[] };

const spansOf = (budgets: BudgetOn[]) => {
	const spans: Span[] = [];

	for (const b of budgets) {
		const span = spans.find((s) => inSpan(s, b));
		if (span) span.accounts.push(b.account);
		if (!span) spans.push({ from: b.from, to: b.to, accounts: [b.account] });
	}

	return spans;
};

const rowsFor = (d: { span: Span; rows: Row[] }[], b: BudgetOn) =>
	d.find((r) => inSpan(r.span, b))?.rows ?? [];

const inSpan = (s: Span, b: BudgetOn) => s.from.equals(b.from) && s.to.equals(b.to);

type ReadRowsOptions = { span: Span; shared: Deltas.Shared };

/** The rows of one span, for the accounts of the budgets that share it. */
const readRows = (ledger: Ledger, { span, shared }: ReadRowsOptions) =>
	Deltas.listDeltas({
		ledger,
		from: span.from,
		to: span.to,
		accounts: span.accounts,
		bucket: 'year',
		shared,
	}).map((b) => ({ span, rows: b.succeeded.flatMap((s) => s.rows) }));

const spendingOf = (b: BudgetOn, rows: Row[]) => {
	const own = rows.filter((r) => r.account.toLowerCase() === b.account.toLowerCase());
	const spent = sum(own.map((r) => r.value!));

	return { ...b, spent, left: (b.limit - spent) as Amount };
};

type SaveBudgetOptions = { ledger: Ledger; account: string; entries: [string, string][] };

/**
 * Writes an account's budget into the file whose B * line already sets it, or
 * into main.rupea, made if it is missing; written only if the file is unchanged
 * since it was read. A start in ISO is written in the first date format of the
 * ledger. Fails for an account the ledger does not have.
 */
export const saveBudget = ({
	ledger,
	account,
	entries,
}: SaveBudgetOptions): ResultAsync<{ file: string; written: string }> =>
	ResultAsync.combine([DB.listBudgetLines(ledger.id), DB.listAccountTree(ledger.id)]).andThen(
		([rows, tree]) => {
			const stars = rows.filter(
				(r) => r.since === null && r.account.toLowerCase() === account.toLowerCase(),
			);
			const key = stars[0]?.file ?? MAIN;
			const keys = withContext('config')((c) => entriesIn(entries, c.ledger.dateFormats));
			if (idsIn(tree, account).length === 0) return errAsync(fault('AccountNotFound', { account }));
			if (stars.length > 1)
				return errAsync(
					fault('AccountRepeated', {
						location: stars.map((r) => `${r.file}:${r.line}`).join(', '),
						account,
					}),
				);

			return writeBudget(ledger, { key, account, keys });
		},
	);

type WriteBudgetOptions = { key: string; account: string; keys: [string, string][] };

const writeBudget = (ledger: Ledger, { key, account, keys }: WriteBudgetOptions) =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		findText(s, key).andThen((f) =>
			withContext('config')((c) =>
				setBudget(readingOf(c, ledger), {
					file: { key, content: f?.content ?? '' },
					account,
					keys,
				}),
			).asyncAndThen((t) =>
				writeText(s, { key, content: t, ifVersion: f?.version ?? null })
					.andTee((w) => reindex({ ledgerId: ledger.id, storage: s, changed: [w.key] }))
					.map((w) => ({ file: w.key, written: `B * ${account}\n${dashed(keys)}` })),
			),
		),
	);

const dashed = (e: [string, string][]) => e.map(([k, x]) => `\t- ${k}: ${x}\n`).join('');
