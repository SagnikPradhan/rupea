import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, sequence, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { writeNumbered, type Storage } from '#lib/server/shared/storage/storage.ts';
import { createHash } from 'node:crypto';
import {
	findStatementByKey,
	findStatementByChecksum,
	forgetStatements,
	saveStatement,
	type StatementRow,
} from './database';

export type StoredStatement = {
	key: string;
	checksum: string;
	originalChecksum: string | null;
	content: Uint8Array;
};

/** A ledger's statements folder, found by content through the `statements` table. */
export type Statements = {
	/** Content the ledger already has comes back where it is, under any name, unlocked if it was. A taken name is numbered. */
	store: (key: string, content: Uint8Array) => ResultAsync<StoredStatement>;
	read: (key: string) => ResultAsync<StoredStatement>;
	/** The statement stored with this content, wherever it was moved, or null once deleted. */
	locate: (checksum: string) => ResultAsync<StoredStatement | null>;
	/** Of these keys, those still stored; the rest are forgotten. */
	present: (keys: string[]) => ResultAsync<string[]>;
	find: (key: string) => ResultAsync<StatementRow>;
	/** New content in place of the old, such as a PDF once unlocked. */
	replace: (key: string, content: Uint8Array) => ResultAsync<StoredStatement>;
};

export const statements = (storage: Storage, ledger: string): Statements => {
	const folder = { storage, ledger };

	return {
		store: (n, c) => store(folder, n, c),
		read: (k) => read(folder, k),
		locate: (c) => locate(folder, c),
		present: (k) => present(folder, k),
		find: (k) => find(folder, k),
		replace: (k, c) => replace(folder, k, c),
	};
};

type Folder = { storage: Storage; ledger: string };

const checksum = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

const store = (f: Folder, name: string, content: Uint8Array): ResultAsync<StoredStatement> => {
	const sum = checksum(content);
	return locate(f, sum).andThen((s) =>
		s ? okAsync(s) : write(f, { key: name, checksum: sum, originalChecksum: null, content }),
	);
};

// A row whose file is gone is dropped, and one whose file changed is recorded anew as it is read,
// so the next row with this content is tried until none is left.
const locate = (f: Folder, sum: string): ResultAsync<StoredStatement | null> =>
	findStatementByChecksum(f.ledger, sum).andThen((r) =>
		r
			? read(f, r.key)
					.orElse(whenGone(f, r.key))
					.andThen((s) => (s && holds(s, sum) ? okAsync(s) : locate(f, sum)))
			: okAsync(null),
	);

const holds = (s: StoredStatement, c: string) => s.checksum === c || s.originalChecksum === c;

const whenGone = (f: Folder, k: string) => (e: RupeeError) =>
	e.type === 'StorageNotFound' ? forgetStatements(f.ledger, [k]).map(() => null) : errAsync(e);

// Listed a day folder at a time, so the check never lists the whole folder.
const present = (f: Folder, keys: string[]): ResultAsync<string[]> => {
	const days = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf('/') + 1)))];
	return sequence(days.map((d) => () => listDay(f, d, keys))).andThen((stored) => {
		const gone = keys.filter((k) => !stored.includes(k));
		return forgetStatements(f.ledger, gone).map(() => keys.filter((k) => stored.includes(k)));
	});
};

const listDay = (f: Folder, d: string, k: string[]): ResultAsync<string[]> =>
	d === ''
		? sequence(k.filter((s) => !s.includes('/')).map((s) => () => stored(f, s)))
		: f.storage.list(d).map((l) => l.map((e) => e.key));

const stored = (f: Folder, k: string): ResultAsync<string[]> =>
	f.storage
		.read(k)
		.map(() => [k])
		.orElse(missing);

const missing = (e: RupeeError) => (e.type === 'StorageNotFound' ? okAsync([]) : errAsync(e));

const write = (f: Folder, s: StoredStatement): ResultAsync<StoredStatement> =>
	writeNumbered(f.storage, s.key, s.content).andThen((e) => record(f, { ...s, key: e.key }));

const record = (f: Folder, s: StoredStatement): ResultAsync<StoredStatement> =>
	saveStatement(f.ledger, {
		key: s.key,
		checksum: s.checksum,
		originalChecksum: s.originalChecksum,
	}).map(() => s);

// A file the table does not know yet, such as one copied into the folder, is recorded as it is read.
const read = (f: Folder, key: string): ResultAsync<StoredStatement> =>
	f.storage.read(key).andThen(({ content }) =>
		findStatementByKey(f.ledger, key).andThen((r) => {
			const sum = checksum(content);
			if (r?.checksum === sum)
				return okAsync({ key, checksum: sum, originalChecksum: r.originalChecksum, content });

			return record(f, { key, checksum: sum, originalChecksum: null, content });
		}),
	);

const find = (f: Folder, key: string): ResultAsync<StatementRow> =>
	findStatementByKey(f.ledger, key).andThen((r) =>
		r
			? okAsync(r)
			: read(f, key).map((s) => ({
					key: s.key,
					checksum: s.checksum,
					originalChecksum: s.originalChecksum,
				})),
	);

const replace = (f: Folder, key: string, content: Uint8Array): ResultAsync<StoredStatement> =>
	find(f, key).andThen((r) =>
		f.storage.write({ key, content }).andThen(() =>
			record(f, {
				key,
				checksum: checksum(content),
				originalChecksum: r.originalChecksum ?? r.checksum,
				content,
			}),
		),
	);
