import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '@rupea/shared/errors.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { Terms } from '@rupea/shared/forms.ts';
import * as v from 'valibot';
import { parseTree } from './parser';
import { print } from './printer';
import {
	NodeKind,
	type RupeaAccountNode,
	type RupeaEntries,
	type RupeaEntryNode,
	type RupeaFile,
} from './types';

type SetTermsOptions = {
	file: Pick<RupeaFile, 'key' | 'content'>;
	account: string;
	terms: RupeaEntries;
};

type TermsLine = {
	account: string;
	since: string | null;
	terms: Record<string, string[]>;
	file: string;
	line: number;
};

/**
 * Each account's terms on a day: its A * line as written, and what that line
 * and the dated lines up to the day say together. A later line overrides only
 * the keys it names, and of two lines for one day the later written wins.
 * Accounts match whatever their case.
 */
export const termsOn = (lines: TermsLine[], day: string) => {
	const upTo = lines.filter((l) => l.since === null || l.since <= day).toSorted(byDay);
	const byAccount = Object.groupBy(upTo, (l) => l.account.toLowerCase());

	return Object.values(byAccount).map((group = []) => {
		const stars = group.filter((l) => l.since === null);
		const held = v.safeParse(Terms, firstValues(group));

		return {
			account: (stars.at(-1) ?? group[0])?.account ?? '',
			current: firstValues(stars),
			held: held.success ? held.output : null,
		};
	});
};

const byDay = (a: TermsLine, b: TermsLine) =>
	(a.since ?? '').localeCompare(b.since ?? '') || a.file.localeCompare(b.file) || a.line - b.line;

const firstValues = (g: TermsLine[]) =>
	Object.fromEntries(
		g.flatMap((l) => Object.entries(l.terms).map(([k, [x = '']]) => [k, x] as const)),
	);

/**
 * Writes the terms of an account under its A * line, in place when the file has
 * one and at the end when not, only if the file then reads back as meant.
 */
export const setTerms = (
	c: LedgerConfiguration,
	{ file, account, terms }: SetTermsOptions,
): Result<string> => {
	const tree = parseTree(c, file);
	const at = tree.children.findIndex((e) => isStar(e, account));
	const old = tree.children[at] as RupeaAccountNode | undefined;
	const node: RupeaAccountNode = {
		kind: NodeKind.Account,
		location: { file: file.key, line: 1 },
		comments: old?.comments ?? [],
		since: null,
		account,
		metadata: terms,
		children: [],
	};
	const children = at < 0 ? [...tree.children, node] : tree.children.with(at, node);
	const content = print(c, { ...tree, children });
	const read = parseTree(c, { key: file.key, content });
	const kept = read.children.filter((e) => isStar(e, account));
	const only = kept.length === 1 ? kept[0] : undefined;

	return only && JSON.stringify(only.metadata) === JSON.stringify(terms)
		? ok(content)
		: err(fault('CannotWriteTerms', { path: file.key }));
};

const isStar = (e: RupeaEntryNode, a: string): e is RupeaAccountNode =>
	e.kind === NodeKind.Account && e.since === null && e.account.toLowerCase() === a.toLowerCase();
