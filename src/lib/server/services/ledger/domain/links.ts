import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { GROUP_KEY, GROUP_KEYS, linksOf, type GroupLink, type GroupRole } from './groups';
import { parse, readEntry } from './parser';
import type { RupeaFile, RupeaTransaction } from './types';

// Where a link goes, and what the header there must still say.
export type LinkEdit = {
	file: string;
	line: number;
	date: string;
	description: string;
	role: GroupRole;
	group: string;
};

// A link goes right under its header, so it is transaction metadata. Each
// header must still be the one suggested, with no link of its own.
export const insertLinks = (
	config: LedgerConfiguration,
	file: Pick<RupeaFile, 'key' | 'content'>,
	edits: LinkEdit[],
): Result<string> => {
	const headers = Object.fromEntries(
		parse(config, file).succeeded.map((t) => [t.location.line, t]),
	);

	const stale = edits.find((e, i) => {
		const t = headers[e.line];
		const repeated = edits.findIndex((o) => o.line === e.line) !== i;
		return (
			!t ||
			repeated ||
			t.date.toString() !== e.date ||
			t.description !== e.description ||
			linksOf(t.metadata).length > 0
		);
	});
	if (stale) return err(fault('GroupStale', { location: `${stale.file}:${stale.line}` }));

	// Bottom up, so earlier insertions do not move later lines.
	const lines = [...edits]
		.sort((a, b) => b.line - a.line)
		.reduce(
			(l, e) => l.toSpliced(e.line, 0, `\t- ${GROUP_KEY[e.role]}: ${e.group}`),
			file.content.split('\n'),
		);
	return ok(lines.join('\n'));
};

export type Relink = (t: RupeaTransaction, l: GroupLink) => GroupLink;

// Rewrites, in place, each link a transaction in the file has to the group;
// formatting, comments and other metadata stay as they were.
export const rewriteLinks = (
	config: LedgerConfiguration,
	file: Pick<RupeaFile, 'key' | 'content'>,
	group: string,
	relink: Relink,
): Result<string> => {
	const members = parse(config, file).succeeded.flatMap((t) =>
		linksOf(t.metadata)
			.filter((l) => l.group === group)
			.map((l) => ({ transaction: t, link: l })),
	);
	if (members.length === 0) return err(fault('GroupStale', { location: file.key }));

	const lines = members.reduce((l, { transaction, link }) => {
		const at = linkLine(l, transaction.location.line, group);
		const written = readEntry(l[at] ?? '');
		const next = relink(transaction, link);
		return at < 0 || !written
			? l
			: l.with(at, `${written.indent}- ${GROUP_KEY[next.role]}: ${next.group}`);
	}, file.content.split('\n'));
	return ok(lines.join('\n'));
};

// A link sits under its header, among the transaction's metadata and comments.
const linkLine = (lines: string[], header: number, group: string): number => {
	const own = lines.slice(header).findIndex((l) => !l.startsWith(';') && !readEntry(l));
	const block = lines.slice(header, own < 0 ? lines.length : header + own);
	const found = block.findIndex((l) => {
		const entry = readEntry(l);
		return entry !== undefined && GROUP_KEYS.includes(entry.key) && entry.value === group;
	});
	return found < 0 ? found : header + found;
};
