import { extname } from 'node:path';
import { fault } from '../result/error';
import { err, ok, type Result, type ResultAsync } from '../result/result';

export enum StorageKind {
	Local = 'local',
}

export type Entry = {
	key: string;
	size: number;
	modified: Date;
	version: string;
};

export type WriteOptions = {
	key: string;
	content: Uint8Array;
	// `null`: the key must not exist yet. Omit to write unconditionally.
	ifVersion?: string | null;
};

export interface Storage {
	list(prefix?: string): ResultAsync<Entry[]>;
	read(key: string): ResultAsync<{ entry: Entry; content: Uint8Array }>;
	write(options: WriteOptions): ResultAsync<Entry>;
	delete(key: string): ResultAsync<void>;
	rename(from: string, to: string): ResultAsync<Entry>;
}

// Opens a user's storage of each kind.
export type Storages = Record<StorageKind, (userId: string) => Storage>;

// No empty, `.` or `..` segments, so a key never escapes the storage root.
export const validateKey = (key: string): Result<string> => {
	const segments = key.split('/');
	const valid = segments.every((s) => s !== '' && s !== '.' && s !== '..' && !s.includes('\\'));
	return valid ? ok(key) : err(fault('StorageInvalidKey', { key }));
};

export const scoped = (storage: Storage, prefix: string): Storage => {
	const inner = (k: string) => `${prefix}/${k}`;
	const outer = (entry: Entry): Entry => ({
		...entry,
		key: entry.key.slice(prefix.length + 1),
	});
	const checked = <T>(k: string, r: (key: string) => ResultAsync<T>): ResultAsync<T> =>
		validateKey(k).asyncAndThen((v) => r(inner(v)));

	return {
		list: (path = '') => storage.list(inner(path)).map((l) => l.map(outer)),
		read: (p) => checked(p, (k) => storage.read(k).map((r) => ({ ...r, entry: outer(r.entry) }))),
		write: (o) => checked(o.key, (k) => storage.write({ ...o, key: k }).map(outer)),
		delete: (e) => checked(e, (k) => storage.delete(k)),
		rename: (r, o) => checked(r, (f) => checked(o, (t) => storage.rename(f, t).map(outer))),
	};
};

/** Writes a new key, or the first of `name-02.ext`, `name-03.ext` and on that is free or holds this content already, so writing again is harmless. */
export const writeNumbered = (s: Storage, k: string, c: Uint8Array): ResultAsync<Entry> =>
	writeAt(s, { key: k, content: c, n: 1 });

type WriteAtOptions = { key: string; content: Uint8Array; n: number };

const writeAt = (s: Storage, o: WriteAtOptions): ResultAsync<Entry> => {
	const key = numbered(o.key, o.n);
	return s
		.write({ key, content: o.content, ifVersion: null })
		.orElse((e) => (e.type === 'StorageConflict' ? written(s, key, o) : err(e)));
};

const written = (s: Storage, key: string, o: WriteAtOptions): ResultAsync<Entry> =>
	s
		.read(key)
		.andThen((r) =>
			Buffer.from(r.content).equals(o.content) ? ok(r.entry) : writeAt(s, { ...o, n: o.n + 1 }),
		);

const numbered = (key: string, n: number) => {
	const extension = extname(key);
	const stem = key.slice(0, key.length - extension.length);
	return n === 1 ? key : `${stem}-${String(n).padStart(2, '0')}${extension}`;
};
