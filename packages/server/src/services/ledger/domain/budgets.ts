import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { parseDate } from '#lib/server/shared/dates.ts';
import { periodOf } from '#lib/server/shared/periods.ts';
import { fault } from '@rupea/shared/errors.ts';
import { BudgetLength } from '@rupea/shared/forms.ts';
import * as v from 'valibot';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { parseAmount, sum, type Amount } from './amounts';
import { parseTree } from './parser';
import { print, printDate } from './printer';
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
	length: BudgetLength;
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
	const plans = plansOf(lines, o.dateFormats);

	return plans.flatMap((p) => periodAt(p, { day: o.day, to: o.day }) ?? []);
};

type BudgetsInOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	first?: Temporal.PlainDate | null;
	dateFormats: string[];
};

const MOST_YEARS = 100;

/**
 * Each account's budget over a range: the limits of every period that starts
 * within it added up, from the first of those periods to the last, with the
 * rest as on the range's last day. When none starts within it, the period of
 * the last day. A period's limit is the one in effect on its last day, or on
 * the range's last day when the range ends earlier. Periods before a budget has
 * a limit are left out, and the range reaches back at most a hundred years and
 * to the period of the first day of the ledger, when it has one by the range's
 * end.
 */
export const budgetsIn = (lines: BudgetLine[], o: BudgetsInOptions): BudgetOn[] => {
	const plans = plansOf(lines, o.dateFormats);

	return plans.flatMap((p) => totalOf(periodsIn(p, o), o.from) ?? []);
};

type Step = {
	since: string;
	keys: Record<string, string>;
	limit: Amount | null;
	length: BudgetLength;
	start: Temporal.PlainDate | null;
};

type Plan = {
	account: string;
	current: Record<string, string>;
	steps: Step[];
	cuts: Temporal.PlainDate[];
};

const plansOf = (lines: BudgetLine[], dateFormats: string[]) => {
	const byAccount = Map.groupBy(lines.toSorted(byDay), (l) => l.account.toLowerCase());

	return [...byAccount.values()].map((g) => planOf(g, dateFormats));
};

const planOf = (group: BudgetLine[], dateFormats: string[]): Plan => {
	const stars = group.filter((l) => l.since === null);
	const dated = group.flatMap((l) => (l.since === null ? [] : [{ ...l, since: l.since }]));
	const steps = [stepOf({ since: '', keys: latestValues(stars) }, dateFormats)];

	for (const l of dated) {
		const keys = { ...steps.at(-1)?.keys, ...latestValues([l]) };
		steps.push(stepOf({ since: l.since, keys }, dateFormats));
	}

	return {
		account: stars.at(-1)?.account ?? group[0]!.account,
		current: latestValues(stars),
		steps,
		cuts: dated.filter(namesCut).map((l) => Temporal.PlainDate.from(l.since)),
	};
};

const stepOf = (o: { since: string; keys: Record<string, string> }, f: string[]): Step => {
	const { limit, period, start } = o.keys;

	return {
		...o,
		limit: parseAmount(limit ?? ''),
		length: v.is(BudgetLength, period) ? period : 'month',
		start: startOf(start ?? '', f),
	};
};

type PeriodAtOptions = { day: Temporal.PlainDate; to: Temporal.PlainDate };

const periodAt = (plan: Plan, o: PeriodAtOptions): BudgetOn | null => {
	const step = stepOn(plan, o.day);
	const length = step.length;
	const before = plan.cuts.findLast((c) => Temporal.PlainDate.compare(c, o.day) <= 0);
	const next = plan.cuts.find((c) => Temporal.PlainDate.compare(c, o.day) > 0);

	const start = before ?? step.start;
	const period = periodOf(o.day, start ? { length, start } : { length });
	const last = next ? next.subtract({ days: 1 }) : null;
	const to = last && Temporal.PlainDate.compare(last, period.to) < 0 ? last : period.to;

	const limit = stepOn(plan, earlier(to, o.to)).limit;

	return limit === null
		? null
		: { account: plan.account, length, limit, current: plan.current, from: period.from, to };
};

const periodsIn = (plan: Plan, o: BudgetsInOptions) => {
	const floor = o.to.subtract({ years: MOST_YEARS });
	const first = o.first && Temporal.PlainDate.compare(o.first, o.to) <= 0 ? o.first : floor;
	const begin = later(o.from, later(floor, first));
	const periods: BudgetOn[] = [];

	const walk = (day: Temporal.PlainDate) => {
		const period = periodAt(plan, { day, to: o.to });
		const next = period ? later(period.to, day).add({ days: 1 }) : limitedAfter(plan, day);
		if (period) periods.push(period);
		if (next && Temporal.PlainDate.compare(next, o.to) <= 0) walk(next);
	};

	if (Temporal.PlainDate.compare(begin, o.to) <= 0) walk(begin);

	return periods;
};

const stepOn = (plan: Plan, day: Temporal.PlainDate): Step => {
	const today = day.toString();
	return plan.steps.findLast((s) => s.since <= today)!;
};

const limitedAfter = (plan: Plan, day: Temporal.PlainDate) => {
	const since = plan.steps.find((s) => s.limit !== null && s.since > day.toString())?.since;

	return since ? Temporal.PlainDate.from(since) : null;
};

const totalOf = (periods: BudgetOn[], from: Temporal.PlainDate): BudgetOn | null => {
	const starting = periods.filter((p) => Temporal.PlainDate.compare(p.from, from) >= 0);
	const counted = starting.length > 0 ? starting : periods.slice(-1);
	const first = counted.at(0);
	const last = counted.at(-1);

	return first && last
		? { ...last, from: first.from, limit: sum(counted.map((p) => p.limit)) }
		: null;
};

const later = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(a, b) > 0 ? a : b;

const earlier = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(a, b) < 0 ? a : b;

const namesCut = (l: BudgetLine) => 'start' in l.keys || 'period' in l.keys;

const startOf = (t: string, f: string[]) =>
	f.map((x) => parseDate({ format: x, text: t })).find((d) => d !== null) ?? null;

const byDay = (a: BudgetLine, b: BudgetLine) =>
	(a.since ?? '').localeCompare(b.since ?? '') || a.file.localeCompare(b.file) || a.line - b.line;

const latestValues = (g: BudgetLine[]) =>
	Object.fromEntries(
		g.flatMap((l) => Object.entries(l.keys).map(([k, [x = '']]) => [k, x] as const)),
	);

/**
 * The entries with an ISO start written in the first date format of the ledger,
 * so the budget reads back whatever the formats are.
 */
export const entriesIn = (e: RupeaEntries, f: string[]): RupeaEntries =>
	e.map(([k, x]) => [k, k === 'start' ? startIn(x, f) : x]);

const startIn = (t: string, f: string[]) =>
	v.is(v.pipe(v.string(), v.isoDate()), t) ? printDate(f[0], Temporal.PlainDate.from(t)) : t;

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

	return JSON.stringify(kept.map((e) => e.metadata)) === JSON.stringify([keys])
		? ok(content)
		: err(fault('CannotWriteBudget', { path: file.key }));
};

const isStar = (e: RupeaEntryNode, a: string): e is RupeaBudgetNode =>
	e.kind === NodeKind.Budget && e.since === null && e.account.toLowerCase() === a.toLowerCase();
