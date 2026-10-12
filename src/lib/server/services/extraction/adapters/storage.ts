import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { safely } from '#lib/server/shared/control.ts';
import type { Entry, Storage } from '#lib/server/shared/storage/storage.ts';

const EXTENSION = '.yml';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export type SchemaFile = Entry & { content: string };

const list = (storage: Storage) => (): ResultAsync<Entry[]> =>
	storage
		.list()
		.map((e) => e.filter(({ key }) => key.endsWith(EXTENSION)))
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }));

type DecodeOptions = {
	key: string;
	entry: Entry;
	content: Uint8Array;
};

const decode = ({ key, entry, content }: DecodeOptions): Result<SchemaFile> => {
	const text = safely(() => decoder.decode(content));
	return text === undefined
		? err(fault('CannotReadFile', { path: key, reason: 'not valid UTF-8' }))
		: ok({ ...entry, content: text });
};

const read =
	(storage: Storage) =>
	(key: string): ResultAsync<SchemaFile> =>
		storage
			.read(key)
			.mapErr((error) =>
				fault('CannotReadFile', {
					path: key,
					reason: 'failed to read schema',
					cause: [error],
				}),
			)
			.andThen(({ entry, content }) => decode({ key, entry, content }));

const write =
	(st: Storage) =>
	(k: string, c: string): ResultAsync<SchemaFile> =>
		st.write({ key: k, content: encoder.encode(c) }).map((e) => ({ ...e, content: c }));

export type Schemas = {
	list: () => ResultAsync<Entry[]>;
	read: (key: string) => ResultAsync<SchemaFile>;
	write: (key: string, content: string) => ResultAsync<SchemaFile>;
};

export const schemas = (storage: Storage): Schemas => ({
	list: list(storage),
	read: read(storage),
	write: write(storage),
});
