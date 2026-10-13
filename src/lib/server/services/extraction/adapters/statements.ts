import { err, ok, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Storage } from '#lib/server/shared/storage/storage.ts';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

export type StoredStatement = {
	key: string;
	checksum: string;
	content: Uint8Array;
};

export type Statements = {
	store: (name: string, content: Uint8Array) => ResultAsync<StoredStatement>;
	read: (key: string) => ResultAsync<StoredStatement>;
};

export const statements = (storage: Storage): Statements => ({
	store: (n, c) => store(storage, { key: n, checksum: checksum(c), content: c }, 1),
	read: (k) =>
		storage.read(k).map((r) => ({ key: k, checksum: checksum(r.content), content: r.content })),
});

const checksum = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

// The same name with other content goes in as `name (2)`, and so on.
const store = (s: Storage, statement: StoredStatement, n: number): ResultAsync<StoredStatement> => {
	const key = numbered(statement.key, n);
	const found = s
		.read(key)
		.map((r) => checksum(r.content))
		.orElse((e) => (e.type === 'StorageNotFound' ? ok(null) : err(e)));

	return found.andThen((f) => {
		if (f === null)
			return s
				.write({ key, content: statement.content, ifVersion: null })
				.map(() => ({ ...statement, key }));

		if (f === statement.checksum) return ok({ ...statement, key });
		return store(s, statement, n + 1);
	});
};

const numbered = (name: string, n: number) => {
	const extension = extname(name);
	return n === 1 ? name : `${name.slice(0, name.length - extension.length)} (${n})${extension}`;
};
