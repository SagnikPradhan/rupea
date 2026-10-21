import { safely } from '#lib/server/shared/control.ts';
import { type Batch, batchAsync } from '#lib/server/shared/result/batch.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { writeNumbered, type Entry, type Storage } from '#lib/server/shared/storage/storage.ts';
import { isLedgerFile } from '../domain/folders';
import type { RupeeFile } from '../domain/types';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

const toFile = (entry: Entry, content: Uint8Array): Result<RupeeFile> => {
	const text = safely(() => decoder.decode(content));
	return text === undefined
		? err(fault('CannotReadFile', { path: entry.key, reason: 'not valid UTF-8' }))
		: ok({ ...entry, content: text });
};

const read =
	(storage: Storage) =>
	(key: string): ResultAsync<RupeeFile> =>
		storage
			.read(key)
			.mapErr((e) =>
				fault('CannotReadFile', { path: key, reason: 'failed to read file', cause: [e] }),
			)
			.andThen(({ entry, content }) => toFile(entry, content));

const entries = (storage: Storage) => (): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }))
		.map((e) => e.filter(({ key }) => isLedgerFile(key)));

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
			.write({ key, content: encoder.encode(content), ifVersion: ifVersion ?? null })
			.map((e) => ({ ...e, content }));

const numbered =
	(s: Storage) =>
	(k: string, c: string): ResultAsync<RupeeFile> =>
		writeNumbered(s, k, encoder.encode(c)).map((e) => ({ ...e, content: c }));

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
	writeNumbered: numbered(storage),
	rename: rename(storage),
	delete: remove(storage),
});

export type Files = ReturnType<typeof files>;
