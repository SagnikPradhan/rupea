/**
 * Ledger use-cases, each run against the ledger of a user. The `.rupee` files in
 * storage are the source of truth; the database index is derived from them.
 * Mutations change the file first and then bring the index along. `sync`
 * repairs whatever changed behind the app's back: files edited directly in
 * storage, or an index write that failed.
 */
import { withContext } from '#lib/server/shared/context.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import { concat, ok, ResultAsync, type Batch, type Result } from '#lib/server/shared/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import { findLedgerId, index, type IndexedTransaction } from '../adapters/database';
import { files } from '../adapters/storage';
import { parse } from '../domain/parser';
import type { RupeeFile, RupeeTransaction } from '../domain/types';

export type { IndexedTransaction };

/** Run `use` against the ledger `userId` is working in. */
export const withLedger = <T>(
	u: string,
	s: (ledgerId: string) => Result<T> | ResultAsync<T>,
): ResultAsync<T> => findLedgerId(u).andThen(s);

/** The `.rupee` files in one ledger's part of the app's storage. */
const ledgerFiles = (l: string) => withContext('storage')((s) => files(scoped(s, `ledgers/${l}`)));

/**
 * Index the transactions `file` parses to, returning its parse errors. A
 * file with errors is indexed without a version, so the next sync parses it
 * again and reports them until they are fixed.
 */
const indexFile = (ledgerId: string, file: RupeeFile): ResultAsync<RupeeError[]> =>
	withContext('config')((config) => {
		const parsed = parse(config, file);
		const version = parsed.failed.length === 0 ? file.version : null;
		return index(ledgerId)
			.put(file.key, version, parsed.succeeded)
			.map(() => parsed.failed);
	});

const reindex = (li: string, k: string): ResultAsync<RupeeError[]> =>
	ledgerFiles(li)
		.read(k)
		.andThen((f) => indexFile(li, f));

const unindex = (li: string, k: string): ResultAsync<RupeeError[]> =>
	index(li)
		.remove(k)
		.map((): RupeeError[] => []);

/**
 * Bring the index in line with storage, comparing versions: index files that
 * are new, changed, or had errors last time, and drop files that are gone.
 * Returns every problem met on the way; failing to list either side is fatal.
 */
const syncLedger = (ledgerId: string): ResultAsync<RupeeError[]> =>
	ResultAsync.combine([ledgerFiles(ledgerId).entries(), index(ledgerId).files()]).andThen(
		([stored, indexed]) => {
			const versions = new Map(indexed.map(({ key, version }) => [key, version]));
			const present = new Set(stored.map(({ key }) => key));
			const changed = stored.filter(({ key, version }) => versions.get(key) !== version);
			const gone = indexed.filter(({ key }) => !present.has(key));
			// One at a time: SQLite has a single connection, and each write is a
			// transaction of its own. A step that fails is a problem to report,
			// not a reason to stop.
			return concat(
				[
					...changed.map(
						({ key }) =>
							() =>
								reindex(ledgerId, key),
					),
					...gone.map(
						({ key }) =>
							() =>
								unindex(ledgerId, key),
					),
				].map((s) => () => s().orElse((err) => ok([err]))),
			);
		},
	);

export const sync = (u: string): ResultAsync<RupeeError[]> => withLedger(u, syncLedger);

/** Every transaction in the ledger, synced first; problems ride along. */
export const getTransactions = (userId: string): ResultAsync<Batch<IndexedTransaction>> =>
	withLedger(userId, (ledgerId) =>
		syncLedger(ledgerId).andThen((fl) =>
			index(ledgerId)
				.transactions()
				.map((s) => ({ succeeded: s, failed: fl })),
		),
	);

export const listFiles = (u: string) => withLedger(u, (l) => ledgerFiles(l).list());

/** Parse `content` as the file `key` would be, without saving anything. */
export const check = (k: string, c: string): Batch<RupeeTransaction> =>
	withContext('config')((f) => parse(f, { key: k, content: c }));

type WriteFileOptions = {
	ledgerId: string;
	key: string;
	content: string;
	ifVersion: string | null;
};

/**
 * Write a file, then index it. The write is what counts: if indexing fails,
 * the file is left for the next sync, which also reports its parse errors.
 */
const writeFile = (options: WriteFileOptions): ResultAsync<RupeeFile> => {
	const { ledgerId, key, content, ifVersion } = options;
	return ledgerFiles(ledgerId)
		.write({ key, content, ifVersion })
		.andTee((w) => indexFile(ledgerId, w));
};

type CreateFileOptions = {
	userId: string;
	key: string;
	content: string;
};

/** Create a new file; fails with `StorageConflict` if `key` exists. */
export const createFile = (options: CreateFileOptions) => {
	const { userId, key, content } = options;
	return withLedger(userId, (l) => writeFile({ ledgerId: l, key, content, ifVersion: null }));
};

type EditFileOptions = CreateFileOptions & {
	/** The version the edit was based on. */
	version: string;
};

/**
 * Replace a file's content, as long as nobody changed it since `version` was
 * read; otherwise fails with `StorageConflict`.
 */
export const editFile = (options: EditFileOptions) => {
	const { userId, key, content, version } = options;
	return withLedger(userId, (l) => writeFile({ ledgerId: l, key, content, ifVersion: version }));
};

type RenameFileOptions = {
	userId: string;
	from: string;
	to: string;
};

/** Rename a file; its indexed transactions move with it, unparsed. */
export const renameFile = (options: RenameFileOptions): ResultAsync<RupeeFile> => {
	const { userId, from, to } = options;
	return withLedger(userId, (li) =>
		ledgerFiles(li)
			.rename(from, to)
			.andTee(() => index(li).rename(from, to)),
	);
};

export const deleteFile = (userId: string, key: string): ResultAsync<void> =>
	withLedger(userId, (li) =>
		ledgerFiles(li)
			.delete(key)
			.andTee(() => index(li).remove(key)),
	);
