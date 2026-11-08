import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
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
	e.kind === NodeKind.Account && e.since === null && e.account === a;
