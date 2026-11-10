import type { Entry, TextFile } from '#lib/server/shared/storage/storage.ts';
import { postedOf, type RupeaTransaction } from '#services/ledger/application/language.ts';

export const entryOf = (f: Entry) => ({
	key: f.key,
	size: f.size,
	modified: Temporal.Instant.fromEpochMilliseconds(f.modified.getTime()),
	version: f.version,
});

export const fileOf = (f: TextFile) => ({ ...entryOf(f), content: f.content });

export const transactionOf = (t: RupeaTransaction) => ({
	file: t.location.file,
	line: t.location.line,
	date: t.date,
	time: t.time,
	description: t.description,
	comment: t.comment,
	postings: t.postings.map((p) => ({ account: p.account, quantity: postedOf(p) })),
});
