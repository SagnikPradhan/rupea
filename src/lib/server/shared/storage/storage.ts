/**
 * Where user files live. A flat object store with `/`-separated keys — the
 * common ground of a local directory, S3, Google Drive and OneDrive. Backends
 * that have folders map key segments onto them; callers only ever see keys.
 *
 * Every entry carries an opaque `version` (a content hash locally, an etag
 * remotely). Writes can be made conditional on it, so a stale edit fails with
 * `StorageConflict` instead of silently overwriting a newer one.
 */
import { err, ok, type Result, type ResultAsync } from '../result';

export type Entry = {
	key: string;
	size: number;
	modified: Date;
	version: string;
};

export type WriteOptions = {
	key: string;
	content: Uint8Array;
	/**
	 * Only write if the stored version is this one. `null` means the key must
	 * not exist yet; omit it to write unconditionally.
	 */
	ifVersion?: string | null;
};

export interface Storage {
	/** Every entry whose key starts with `prefix`, in no particular order. */
	list(prefix?: string): ResultAsync<Entry[]>;
	read(key: string): ResultAsync<{ entry: Entry; content: Uint8Array }>;
	write(options: WriteOptions): ResultAsync<Entry>;
	/** Deleting a key that does not exist is not an error. */
	delete(key: string): ResultAsync<void>;
	/** Fails with `StorageConflict` if `to` already exists. */
	rename(from: string, to: string): ResultAsync<Entry>;
}

/**
 * A key is one or more non-empty `/`-separated segments, none of them `.` or
 * `..`, so it can never name anything outside the storage root.
 */
export const validateKey = (key: string): Result<string> => {
	const segments = key.split('/');
	const valid = segments.every((s) => s !== '' && s !== '.' && s !== '..' && !s.includes('\\'));
	return valid ? ok(key) : err({ type: 'StorageInvalidKey', key, cause: [] });
};

/**
 * A view of `storage` confined to `prefix`: every key is resolved beneath it,
 * and keys come back relative to it. This is how each ledger gets its own
 * namespace inside one backend.
 */
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
