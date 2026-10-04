/**
 * Outbound storage adapter for the ledger: reads and writes `.rupee` files in
 * the ledger's `Storage`, which is already scoped to the ledger. The only
 * place in the ledger that names its own read failures.
 *
 * Each operation is a private builder over a `Storage`; `files` composes
 * them into the one view of a ledger's files this module exposes.
 */
import {
	batchAsync,
	err,
	ok,
	safely,
	type Batch,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import type { Entry, Storage } from '#lib/server/shared/storage/storage.ts';
import type { RupeeFile } from '../domain/types';

const EXTENSION = '.rupee';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

const toFile = (entry: Entry, content: Uint8Array): Result<RupeeFile> => {
	const text = safely(() => decoder.decode(content));
	return text === undefined
		? err({
				type: 'CannotReadFile',
				path: entry.key,
				reason: 'not valid UTF-8',
				cause: [],
			})
		: ok({ ...entry, content: text });
};

/** The text of the file at `key`. */
const read =
	(storage: Storage) =>
	(key: string): ResultAsync<RupeeFile> =>
		storage
			.read(key)
			.mapErr((error): RupeeError => ({
				type: 'CannotReadFile',
				path: key,
				reason: 'failed to read file',
				cause: [error],
			}))
			.andThen(({ entry, content }) => toFile(entry, content));

/** The storage entry of every `.rupee` file, without reading any content. */
const entries = (storage: Storage) => (): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((error): RupeeError => ({
			type: 'CannotReadDirectory',
			path: '',
			cause: [error],
		}))
		.map((e) => e.filter(({ key }) => key.endsWith(EXTENSION)));

/**
 * Every `.rupee` file in the ledger. A read failure on one file rides along
 * in the `Batch`; failing to list the storage is fatal.
 */
const list = (st: Storage) => (): ResultAsync<Batch<RupeeFile>> =>
	entries(st)().andThen((l) => batchAsync(l.map(({ key }) => read(st)(key))));

/**
 * Write `content` to `key`. With `ifVersion`, the write only happens if the
 * stored file is still at that version (`null`: if it does not exist yet).
 */
type LedgerWriteOptions = {
	key: string;
	content: string;
	ifVersion?: string | null;
};

const write =
	(storage: Storage) =>
	({ key, content, ifVersion }: LedgerWriteOptions): ResultAsync<RupeeFile> =>
		storage
			.write({
				key,
				content: encoder.encode(content),
				...(ifVersion === undefined ? {} : { ifVersion }),
			})
			.map((e) => ({ ...e, content }));

const rename =
	(st: Storage) =>
	(f: string, t: string): ResultAsync<RupeeFile> =>
		st.rename(f, t).andThen(() => read(st)(t));

const remove = (s: Storage) => (k: string) => s.delete(k);

/** One ledger's `.rupee` files. */
export const files = (storage: Storage) => ({
	entries: entries(storage),
	list: list(storage),
	read: read(storage),
	write: write(storage),
	rename: rename(storage),
	delete: remove(storage),
});

export type Files = ReturnType<typeof files>;
