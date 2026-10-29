import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';
import { isBlank, isComment, isMetadata, isPosting, lines, parse, type RupeaLine } from './parser';
import type { RupeaMetadata, RupeaTransaction } from './types';

type MergeOptions = {
	draft: { key: string; content: string };
	file: { key: string; content: string };
};

/** Writes a draft's transactions into a file by date, leaving out those it holds already, and adds the draft's metadata to the file's. */
export const merge = (c: LedgerConfiguration, { draft, file }: MergeOptions) => {
	const from = parse(c, draft);
	const into = parse(c, file);
	if (from.failed.length > 0 || from.prices.length > 0 || from.links.length > 0)
		return err(fault('CannotMergeFile', { path: draft.key }));

	const fresh = unseen(into.succeeded, from.succeeded).toSorted((a, b) =>
		Temporal.PlainDate.compare(a.date, b.date),
	);
	const text = trimEnd(lines(file.key, file.content));
	const drafted = lines(draft.key, draft.content);
	const blocks = Object.groupBy(
		fresh.map((t) => ({ at: placeOf(into.succeeded, t, text.length), lines: blockOf(drafted, t) })),
		(b) => b.at,
	);

	const entries = entriesOf(into.metadata, from.metadata);
	const top = preambleEnd(text);
	const content = [
		...text.flatMap((line, i) => [
			...(i === top ? spaced(entries, top) : []),
			...(blocks[i] ?? []).flatMap((b) => [...b.lines, '']),
			line.content,
		]),
		...(top === text.length ? entries : []),
		...(blocks[text.length] ?? []).flatMap((b) => ['', ...b.lines]),
	];

	return ok({
		content: `${content.join('\n').trim()}\n`,
		added: fresh.length,
		skipped: from.succeeded.length - fresh.length,
	});
};

/** A drafted transaction is held already when one has its date, description and first posting, each held one matching once. */
const unseen = (held: RupeaTransaction[], drafted: RupeaTransaction[]) => {
	const counts: Record<string, number> = {};
	for (const t of held) counts[keyOf(t)] = (counts[keyOf(t)] ?? 0) + 1;

	return drafted.filter((t) => {
		const left = counts[keyOf(t)] ?? 0;
		counts[keyOf(t)] = left - 1;
		return left === 0;
	});
};

const keyOf = (t: RupeaTransaction) => {
	const p = t.postings[0];
	return [t.date, t.description, p?.account, p?.amount, p?.commodity].join('|');
};

/** The line a transaction goes above: the first held one dated after it, or the end. */
const placeOf = (held: RupeaTransaction[], t: RupeaTransaction, end: number) => {
	const later = held.find((h) => Temporal.PlainDate.compare(h.date, t.date) > 0);
	return later ? later.location.line - 1 : end;
};

/** A transaction's header with the postings, metadata and comments under it. */
const blockOf = (drafted: RupeaLine[], t: RupeaTransaction) => {
	const block = drafted.slice(t.location.line - 1);
	const end = block.findIndex((l, i) => i > 0 && !isPosting(l) && !isMetadata(l) && !isComment(l));
	return block.slice(0, end < 0 ? undefined : end).map((l) => l.content);
};

const entriesOf = (h: RupeaMetadata, d: RupeaMetadata) =>
	Object.entries(d).flatMap(([key, values]) =>
		values.filter((v) => !h[key]?.includes(v)).map((v) => `- ${key}: ${v}`),
	);

/** Just below the file's own metadata, or the top when it has none. */
const preambleEnd = (text: RupeaLine[]) => {
	const end = text.findIndex((l) => !isBlank(l) && !isMetadata(l));
	return text.slice(0, end < 0 ? undefined : end).findLastIndex(isMetadata) + 1;
};

/** Entries at the top of a file stand apart from the transaction below them. */
const spaced = (e: string[], n: number) => (n === 0 && e.length > 0 ? [...e, ''] : e);

const trimEnd = (l: RupeaLine[]) => l.slice(0, l.findLastIndex((x) => !isBlank(x)) + 1);
