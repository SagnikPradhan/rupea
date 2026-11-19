import { consistently } from '#lib/server/db/read-only.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { errAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { findText, writeText } from '#lib/server/shared/storage/storage.ts';
import { fault } from '@rupea/shared/errors.ts';
import * as DB from '../adapters/database';
import { sum, type Amount } from '../domain/amounts';
import { budgetsOn, setBudget, type BudgetOn } from '../domain/budgets';
import type { Row } from '../domain/deltas';
import { idsIn } from '../domain/tree';
import type { Ledger } from '../domain/types';
import * as Deltas from './deltas';
import { openFolder } from './ledger';
import { reindex } from './sync';

const MAIN = 'main.rupea';

type ListBudgetsOptions = { ledger: Ledger; day: Temporal.PlainDate };

/**
 * Each account's budget on a day with what it and the accounts under it spent
 * in the budget's period, and what is left of the limit. A budget on an account
 * the ledger has no postings for has spent nothing.
 */
export const listBudgets = ({ ledger, day }: ListBudgetsOptions) =>
	consistently(() =>
		ResultAsync.combine([DB.listBudgetLines(ledger.id), Deltas.findShared(ledger.id)]).andThen(
			([lines, shared]) => {
				const budgets = withContext('config')((c) =>
					budgetsOn(lines, { day, dateFormats: c.ledger.dateFormats }),
				);
				const known = budgets.filter((b) => idsIn(shared.tree, b.account).length > 0);
				const reads = spansOf(known).map((s) => readRows(ledger, { span: s, shared }));

				return ResultAsync.combine(reads).map((read) => ({
					succeeded: budgets.map((b) =>
						spendingOf(b, read.find((r) => inSpan(r.span, b))?.rows ?? []),
					),
					failed: shared.failed,
				}));
			},
		),
	);

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
	const spent = sum(own.flatMap((r) => r.value ?? []));

	return { ...b, spent, left: (b.limit - spent) as Amount };
};

type SaveBudgetOptions = { ledger: Ledger; account: string; entries: [string, string][] };

/**
 * Writes an account's budget into the file whose B * line already sets it, or
 * into main.rupea, made if it is missing; written only if the file is unchanged
 * since it was read.
 */
export const saveBudget = ({
	ledger,
	account,
	entries,
}: SaveBudgetOptions): ResultAsync<{ file: string; written: string }> =>
	DB.listBudgetLines(ledger.id).andThen((rows) => {
		const stars = rows.filter(
			(r) => r.since === null && r.account.toLowerCase() === account.toLowerCase(),
		);
		const key = stars[0]?.file ?? MAIN;
		if (stars.length > 1)
			return errAsync(
				fault('AccountRepeated', {
					location: stars.map((r) => `${r.file}:${r.line}`).join(', '),
					account,
				}),
			);

		return openFolder({ ledger, folder: 'files' }).andThen((s) =>
			findText(s, key).andThen((f) =>
				withContext('config')((c) =>
					setBudget(c.ledger, { file: { key, content: f?.content ?? '' }, account, keys: entries }),
				).asyncAndThen((t) =>
					writeText(s, { key, content: t, ifVersion: f?.version ?? null })
						.andTee((w) => reindex({ ledgerId: ledger.id, storage: s, changed: [w.key] }))
						.map((w) => ({ file: w.key, written: `B * ${account}\n${dashed(entries)}` })),
				),
			),
		);
	});

const dashed = (e: [string, string][]) => e.map(([k, x]) => `\t- ${k}: ${x}\n`).join('');
