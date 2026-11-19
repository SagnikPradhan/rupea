import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { parseDate } from '#lib/server/shared/dates.ts';
import { periodOf } from '#lib/server/shared/periods.ts';
import { fault } from '@rupea/shared/errors.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { parseAmount, type Amount } from './amounts';
import { parseTree } from './parser';
import { print } from './printer';
import {
	NodeKind,
	type RupeaBudgetNode,
	type RupeaEntries,
	type RupeaEntryNode,
	type RupeaFile,
} from './types';

export type BudgetLine = {
	account: string;
	since: string | null;
	keys: Record<string, string[]>;
	file: string;
	line: number;
};

export type BudgetOn = {
	account: string;
	length: 'month' | 'year';
	limit: Amount;
	current: Record<string, string>;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
};

type SetBudgetOptions = {
	file: Pick<RupeaFile, 'key' | 'content'>;
	account: string;
	keys: RupeaEntries;
};

type BudgetsOptions = { day: Temporal.PlainDate; dateFormats: string[] };

/**
 * Each account's budget on a day, from its B * line and the dated lines up to
 * the day. A later line overrides only the keys it names, and of two lines for
 * one day the later written wins. A dated line that names start or period
 * starts the periods on its own date. Accounts match whatever their case.
 */
export const budgetsOn = (lines: BudgetLine[], o: BudgetsOptions): BudgetOn[] => {
	const byAccount = Object.groupBy(lines.toSorted(byDay), (l) => l.account.toLowerCase());

	return Object.values(byAccount).flatMap((group = []) => budgetOf(group, o) ?? []);
};

const budgetOf = (group: BudgetLine[], o: BudgetsOptions): BudgetOn | null => {
	const today = o.day.toString();
	const upTo = group.filter((l) => l.since === null || l.since <= today);
	const stars = upTo.filter((l) => l.since === null);

	const { limit: text, period: named, start: written } = latestValues(upTo);
	const limit = parseAmount(text ?? '');
	const length: 'month' | 'year' = named === 'year' ? 'year' : 'month';

	const cuts = group.filter(namesCut);
	const before = cuts.filter((l) => l.since !== null && l.since <= today).at(-1)?.since;
	const next = cuts.find((l) => l.since !== null && l.since > today)?.since;

	const start = before ? Temporal.PlainDate.from(before) : startOf(written ?? '', o.dateFormats);
	const period = periodOf(o.day, start ? { length, start } : { length });
	const last = next ? Temporal.PlainDate.from(next).subtract({ days: 1 }) : null;

	return limit === null
		? null
		: {
				account: (stars.at(-1) ?? upTo[0])?.account ?? '',
				length,
				limit,
				current: latestValues(stars),
				from: period.from,
				to: last && Temporal.PlainDate.compare(last, period.to) < 0 ? last : period.to,
			};
};

const namesCut = (l: BudgetLine) => l.since !== null && ('start' in l.keys || 'period' in l.keys);

const startOf = (t: string, f: string[]) =>
	f.map((x) => parseDate({ format: x, text: t })).find((d) => d !== null);

const byDay = (a: BudgetLine, b: BudgetLine) =>
	(a.since ?? '').localeCompare(b.since ?? '') || a.file.localeCompare(b.file) || a.line - b.line;

const latestValues = (g: BudgetLine[]) =>
	Object.fromEntries(
		g.flatMap((l) => Object.entries(l.keys).map(([k, [x = '']]) => [k, x] as const)),
	);

/**
 * Writes the keys of an account under its B * line, in place when the file has
 * one and at the end when not, only if the file then reads back as meant.
 */
export const setBudget = (
	c: LedgerConfiguration,
	{ file, account, keys }: SetBudgetOptions,
): Result<string> => {
	const tree = parseTree(c, file);
	const at = tree.children.findIndex((e) => isStar(e, account));
	const old = tree.children[at] as RupeaBudgetNode | undefined;
	const node: RupeaBudgetNode = {
		kind: NodeKind.Budget,
		location: { file: file.key, line: 1 },
		comments: old?.comments ?? [],
		since: null,
		account,
		metadata: keys,
		children: [],
	};
	const children = at < 0 ? [...tree.children, node] : tree.children.with(at, node);
	const content = print(c, { ...tree, children });
	const read = parseTree(c, { key: file.key, content });
	const kept = read.children.filter((e) => isStar(e, account));
	const only = kept.length === 1 ? kept[0] : undefined;

	return only && JSON.stringify(only.metadata) === JSON.stringify(keys)
		? ok(content)
		: err(fault('CannotWriteBudget', { path: file.key }));
};

const isStar = (e: RupeaEntryNode, a: string): e is RupeaBudgetNode =>
	e.kind === NodeKind.Budget && e.since === null && e.account.toLowerCase() === a.toLowerCase();
