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
	findByKey: (key: string) => ResultAsync<StatementRow>;
	/** Wherever it was moved, or null once deleted. */
	findByChecksum: (checksum: string) => ResultAsync<StoredStatement | null>;
	/** The keys still stored. */
	dropMissing: (keys: string[]) => ResultAsync<string[]>;
	/** New content in place of the old, such as a PDF once unlocked. */
	replace: (key: string, content: Uint8Array) => ResultAsync<StoredStatement>;
};

export const statements = (storage: Storage, ledger: string): Statements => {
	const folder = { storage, ledger };

	return {
		store: (n, c) => store(folder, n, c),
		read: (k) => read(folder, k),
		findByKey: (k) => findByKey(folder, k),
		findByChecksum: (c) => findByChecksum(folder, c),
		dropMissing: (k) => dropMissing(folder, k),
		replace: (k, c) => replace(folder, k, c),
	};
};

type Folder = { storage: Storage; ledger: string };

const checksum = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

const store = (f: Folder, name: string, content: Uint8Array): ResultAsync<StoredStatement> => {
	const sum = checksum(content);
	return findByChecksum(f, sum).andThen((s) =>
		s ? okAsync(s) : write(f, { key: name, checksum: sum, originalChecksum: null, content }),
	);
};

const findByChecksum = (f: Folder, sum: string): ResultAsync<StoredStatement | null> =>
	findStatementByChecksum(f.ledger, sum).andThen((r) => {
		if (!r) return okAsync(null);

		return read(f, r.key)
			.orElse((e) =>
				e.type === 'StorageNotFound'
					? forgetStatements(f.ledger, [r.key]).map(() => null)
					: errAsync(e),
			)
			.andThen((s) =>
				s?.checksum === sum || s?.originalChecksum === sum ? okAsync(s) : findByChecksum(f, sum),
			);
	});

const dropMissing = (f: Folder, keys: string[]): ResultAsync<string[]> => {
	const folders = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf('/') + 1)))];
	return sequence(folders.map((d) => () => f.storage.list(d))).andThen((l) => {
		const stored = l.map((e) => e.key);
		const gone = keys.filter((k) => !stored.includes(k));
		return forgetStatements(f.ledger, gone).map(() => keys.filter((k) => stored.includes(k)));
	});
};

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

const findByKey = (f: Folder, key: string): ResultAsync<StatementRow> =>
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
	findByKey(f, key).andThen((r) =>
		f.storage.write({ key, content }).andThen(() =>
			record(f, {
				key,
				checksum: checksum(content),
				originalChecksum: r.originalChecksum ?? r.checksum,
				content,
			}),
		),
	);
