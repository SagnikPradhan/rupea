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
