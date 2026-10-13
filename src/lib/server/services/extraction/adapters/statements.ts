import { err, okAsync, sequence, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Storage } from '#lib/server/shared/storage/storage.ts';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import {
	findStatement,
	listStatements,
	locateStatement,
	moveStatement,
	replaceStatements,
	saveStatement,
	type StatementRow,
} from './database';

export type { StatementRow };

export type StoredStatement = {
	key: string;
	checksum: string;
	original: string | null;
	content: Uint8Array;
};

/** A ledger's statements folder, found by content through the `statements` table. */
export type Statements = {
	/** Content the ledger already has comes back where it is, under any name. */
	store: (name: string, content: Uint8Array) => ResultAsync<StoredStatement>;
	read: (key: string) => ResultAsync<StoredStatement>;
	find: (key: string) => ResultAsync<StatementRow>;
	locate: (checksum: string) => ResultAsync<StatementRow | null>;
	/** New content in place of the old, such as a PDF once unlocked. */
	replace: (key: string, content: Uint8Array) => ResultAsync<StoredStatement>;
	rename: (from: string, to: string) => ResultAsync<void>;
	rebuild: () => ResultAsync<void>;
};

export const statements = (storage: Storage, ledger: string): Statements => {
	const folder = { storage, ledger };

	return {
		store: (n, c) => store(folder, n, c),
		read: (k) => read(folder, k),
		find: (k) => find(folder, k),
		locate: (c) => locateStatement(ledger, c),
		replace: (k, c) => replace(folder, k, c),
		rename: (f, t) => storage.rename(f, t).andThen(() => moveStatement({ ledger, from: f, to: t })),
		rebuild: () => rebuild(folder),
	};
};

type Folder = { storage: Storage; ledger: string };

const checksum = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

const store = (f: Folder, name: string, content: Uint8Array): ResultAsync<StoredStatement> => {
	const sum = checksum(content);
	return locateStatement(f.ledger, sum).andThen((r) =>
		r
			? okAsync({ key: r.path, checksum: sum, original: r.original, content })
			: write(f, { key: name, checksum: sum, original: null, content }, 1),
	);
};

// The same name with other content goes in as `name (2)`, and so on.
const write = (f: Folder, s: StoredStatement, n: number): ResultAsync<StoredStatement> => {
	const key = numbered(s.key, n);
	return f.storage
		.write({ key, content: s.content, ifVersion: null })
		.map(() => ({ ...s, key }))
		.orElse((e) => (e.type === 'StorageConflict' ? write(f, s, n + 1) : err(e)))
		.andThen((w) => record(f, w));
};

const numbered = (name: string, n: number) => {
	const extension = extname(name);
	return n === 1 ? name : `${name.slice(0, name.length - extension.length)} (${n})${extension}`;
};

const record = (f: Folder, s: StoredStatement): ResultAsync<StoredStatement> =>
	saveStatement(f.ledger, { path: s.key, checksum: s.checksum, original: s.original }).map(() => s);

// A file the table does not know yet, such as one copied into the folder, is recorded as it is read.
const read = (f: Folder, key: string): ResultAsync<StoredStatement> =>
	f.storage.read(key).andThen(({ content }) =>
		findStatement(f.ledger, key).andThen((r) => {
			const sum = checksum(content);
			if (r?.checksum === sum)
				return okAsync({ key, checksum: sum, original: r.original, content });

			return record(f, { key, checksum: sum, original: null, content });
		}),
	);

const find = (f: Folder, key: string): ResultAsync<StatementRow> =>
	findStatement(f.ledger, key).andThen((r) =>
		r
			? okAsync(r)
			: read(f, key).map((s) => ({ path: s.key, checksum: s.checksum, original: s.original })),
	);

const replace = (f: Folder, key: string, content: Uint8Array): ResultAsync<StoredStatement> =>
	find(f, key).andThen((r) =>
		f.storage.write({ key, content }).andThen(() =>
			record(f, {
				key,
				checksum: checksum(content),
				original: r.original ?? r.checksum,
				content,
			}),
		),
	);

// Every file is read and hashed, so this runs only when the folder may have changed behind Rupee's back.
const rebuild = (f: Folder): ResultAsync<void> =>
	listStatements(f.ledger).andThen((before) => {
		const known = Object.fromEntries(before.map((r) => [r.path, r]));
		const hashed = (key: string, content: Uint8Array): StatementRow => {
			const sum = checksum(content);
			const original = known[key]?.checksum === sum ? known[key].original : null;
			return { path: key, checksum: sum, original };
		};

		return f.storage
			.list()
			.andThen((l) =>
				sequence(l.map((e) => () => f.storage.read(e.key).map((r) => [hashed(e.key, r.content)]))),
			)
			.andThen((r) => replaceStatements(f.ledger, r));
	});
