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

const entries = (storage: Storage) => (): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((error): RupeeError => ({
			type: 'CannotReadDirectory',
			path: '',
			cause: [error],
		}))
		.map((e) => e.filter(({ key }) => key.endsWith(EXTENSION)));

const list = (st: Storage) => (): ResultAsync<Batch<RupeeFile>> =>
	entries(st)().andThen((l) => batchAsync(l.map(({ key }) => read(st)(key))));

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

export const files = (storage: Storage) => ({
	entries: entries(storage),
	list: list(storage),
	read: read(storage),
	write: write(storage),
	rename: rename(storage),
	delete: remove(storage),
});

export type Files = ReturnType<typeof files>;
