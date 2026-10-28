import { extname } from 'node:path';
import { safely } from '../control';
import { fault } from '../result/error';
import { err, ok, type Result, type ResultAsync } from '../result/result';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export enum StorageKind {
	Local = 'local',
}

export type Entry = {
	key: string;
	size: number;
	modified: Date;
	/** Opaque to everyone but the storage, and different whenever the content may be. */
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
	/** Yields each key that may have changed, by anyone, until the signal aborts. */
	watch(signal: AbortSignal): AsyncIterable<string>;
}

/** A stored file read as UTF-8 text. */
export type TextFile = {
	key: string;
	size: number;
	modified: Date;
	version: string;
	content: string;
};

type WriteTextOptions = {
	key: string;
	content: string;
	ifVersion?: string | null;
};

/** A key that may have changed in one user's storage. */
export type Change = { user: string; key: string };

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
		watch: (s) => within(storage.watch(s), `${prefix}/`),
	};
};

export const readText = (storage: Storage, key: string): ResultAsync<TextFile> =>
	storage
		.read(key)
		.mapErr((e) =>
			fault('CannotReadFile', { path: key, reason: 'failed to read file', cause: [e] }),
		)
		.andThen(({ entry, content }) => {
			const text = safely(() => decoder.decode(content));
			return text === undefined
				? err(fault('CannotReadFile', { path: key, reason: 'not valid UTF-8' }))
				: ok({ ...entry, content: text });
		});

/** Reads text as readText does, or null when nothing is stored at the key. */
export const findText = (storage: Storage, key: string): ResultAsync<TextFile | null> =>
	readText(storage, key)
		.map((f): TextFile | null => f)
		.orElse((e) =>
			e.type === 'CannotReadFile' && e.cause?.[0]?.type === 'StorageNotFound' ? ok(null) : err(e),
		);

export const writeText = (s: Storage, o: WriteTextOptions): ResultAsync<TextFile> =>
	s.write({ ...o, content: encoder.encode(o.content) }).map((e) => ({ ...e, content: o.content }));

/** Writes text as `writeNumbered` writes bytes. */
export const writeNumberedText = (s: Storage, k: string, t: string): ResultAsync<TextFile> =>
	writeNumbered(s, k, encoder.encode(t)).map((e) => ({ ...e, content: t }));

/** Writes a new key, or the first of `name-02.ext`, `name-03.ext` and on that is free or holds this content already, so writing again is harmless. */
export const writeNumbered = (s: Storage, k: string, c: Uint8Array): ResultAsync<Entry> =>
	writeAt(s, k, c, 1);

const writeAt = (s: Storage, k: string, c: Uint8Array, n: number): ResultAsync<Entry> => {
	const key = numbered(k, n);
	return s
		.write({ key, content: c, ifVersion: null })
		.orElse((e) =>
			e.type === 'StorageConflict'
				? s
						.read(key)
						.andThen((r) =>
							Buffer.from(r.content).equals(c) ? ok(r.entry) : writeAt(s, k, c, n + 1),
						)
				: err(e),
		);
};

const numbered = (key: string, n: number) => {
	const extension = extname(key);
	const stem = key.slice(0, key.length - extension.length);
	return n === 1 ? key : `${stem}-${String(n).padStart(2, '0')}${extension}`;
};

async function* within(ks: AsyncIterable<string>, p: string) {
	for await (const k of ks) if (k.startsWith(p)) yield k.slice(p.length);
}
