import { errAsync, inOrder, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { writeNumbered, type Storage } from '#lib/server/shared/storage/storage.ts';
import { createHash } from 'node:crypto';
import * as DB from './database';

export type StoredStatement = {
	key: string;
	checksum: string;
	originalChecksum: string | null;
	content: Uint8Array;
};

type Upload = { key: string; content: Uint8Array };

/** Content the ledger already has comes back where it is, under any name, unlocked if it was. A taken name is numbered. */
export const store = (
	storage: Storage,
	ledgerId: string,
	upload: Upload,
): ResultAsync<StoredStatement> => {
	const sum = checksum(upload.content);
	return findByChecksum(storage, ledgerId, sum).andThen((s) =>
		s ? okAsync(s) : write(storage, ledgerId, { ...upload, checksum: sum, originalChecksum: null }),
	);
};

// A file the table does not know yet, such as one copied into the folder, is recorded as it is read.
export const read = (
	storage: Storage,
	ledgerId: string,
	key: string,
): ResultAsync<StoredStatement> =>
	storage.read(key).andThen(({ content }) =>
		DB.findStatement(ledgerId, key).andThen((r) => {
			const sum = checksum(content);
			if (r?.checksum === sum)
				return okAsync({ key, checksum: sum, originalChecksum: r.originalChecksum, content });

			return record(ledgerId, { key, checksum: sum, originalChecksum: null, content });
		}),
	);

export const findByKey = (
	storage: Storage,
	ledgerId: string,
	key: string,
): ResultAsync<DB.StatementRow> =>
	DB.findStatement(ledgerId, key).andThen((r) =>
		r
			? okAsync(r)
			: read(storage, ledgerId, key).map((s) => ({
					key: s.key,
					checksum: s.checksum,
					originalChecksum: s.originalChecksum,
				})),
	);

/** Wherever it was moved, or null once deleted. */
export const findByChecksum = (
	storage: Storage,
	ledgerId: string,
	sum: string,
): ResultAsync<StoredStatement | null> =>
	DB.findStatementByChecksum(ledgerId, sum).andThen((r) => {
		if (!r) return okAsync(null);

		return read(storage, ledgerId, r.key)
			.orElse((e) =>
				e.type === 'StorageNotFound'
					? DB.deleteStatements(ledgerId, [r.key]).map(() => null)
					: errAsync(e),
			)
			.andThen((s) =>
				s?.checksum === sum || s?.originalChecksum === sum
					? okAsync(s)
					: findByChecksum(storage, ledgerId, sum),
			);
	});

/** Forgets the statements whose file is gone, and returns the keys still stored. */
export const dropMissing = (
	storage: Storage,
	ledgerId: string,
	keys: string[],
): ResultAsync<string[]> => {
	const folders = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf('/') + 1)))];
	return inOrder(folders.map((d) => () => storage.list(d))).andThen((listed) => {
		const stored = listed.flat().map((e) => e.key);
		const gone = keys.filter((k) => !stored.includes(k));
		return DB.deleteStatements(ledgerId, gone).map(() => keys.filter((k) => stored.includes(k)));
	});
};

/** New content in place of the old, such as a PDF once unlocked. */
export const replace = (
	storage: Storage,
	ledgerId: string,
	{ key, content }: Upload,
): ResultAsync<StoredStatement> =>
	findByKey(storage, ledgerId, key).andThen((r) =>
		storage.write({ key, content }).andThen(() =>
			record(ledgerId, {
				key,
				checksum: checksum(content),
				originalChecksum: r.originalChecksum ?? r.checksum,
				content,
			}),
		),
	);

const checksum = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

const write = (o: Storage, id: string, s: StoredStatement): ResultAsync<StoredStatement> =>
	writeNumbered(o, s.key, s.content).andThen((e) => record(id, { ...s, key: e.key }));

const record = (ledgerId: string, s: StoredStatement): ResultAsync<StoredStatement> =>
	DB.saveStatement(ledgerId, {
		key: s.key,
		checksum: s.checksum,
		originalChecksum: s.originalChecksum,
	}).map(() => s);
