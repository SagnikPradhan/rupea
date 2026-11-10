import { byCodeUnit } from '@rupea/shared/text.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeaError } from '@rupea/shared/error.ts';
import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import {
	errAsync,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import {
	findText,
	readText,
	writeNumberedText,
	writeText,
	type Entry,
	type Storage,
} from '#lib/server/shared/storage/storage.ts';
import { isCounted } from '@rupea/shared/folders.ts';
import type { TransactionForm } from '@rupea/shared/transaction-form.ts';
import * as DB from '../adapters/database';
import { merge } from '../domain/merge';
import { parse, parseTree } from '../domain/parser';
import { print } from '../domain/printer';
import { find, insert, remove, replace } from '../domain/transactions';
import type { Ledger, RupeaFile, RupeaTransaction } from '../domain/types';
import { openFolder } from './ledger';
import { reindex } from './sync';
import { listLedgerFiles, type Move } from './sync-index';

/** The ledger files, without their text. */
export const listFiles = (l: Ledger): ResultAsync<Entry[]> =>
	openFolder({ ledger: l, folder: 'files' }).andThen(listLedgerFiles);

type ReadFileOptions = { ledger: Ledger; key: string };

export const readFile = ({ ledger, key }: ReadFileOptions): ResultAsync<RupeaFile> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) => readText(s, key));

type FindImportedOptions = { ledger: Ledger; checksums: string[] };

/**
 * Of these statement checksums, those a file was imported from, with each such
 * file.
 */
export const findImported = ({
	ledger,
	checksums,
}: FindImportedOptions): ResultAsync<{ checksum: string; file: string }[]> =>
	checksums.length === 0 ? okAsync([]) : DB.findImported(ledger.id, checksums);

type FindLatestFileOptions = { ledger: Ledger; account: string };

/**
 * The counted file holding an account's latest transaction, where its next ones
 * likely go.
 */
export const findLatestFile = ({
	ledger,
	account,
}: FindLatestFileOptions): ResultAsync<string | null> => DB.findLatestFile(ledger.id, account);

/**
 * The files a new transaction can go in, and the one with the ledger's latest
 * transaction.
 */
export const findTransactionFiles = (
	l: Ledger,
): ResultAsync<{ keys: string[]; newest: string | null }> =>
	DB.listIndexedFiles(l.id).andThen((files) =>
		DB.findNewestFile(l.id).map((newest) => ({
			keys: files
				.map((f) => f.key)
				.filter(isCounted)
				.toSorted(byCodeUnit),
			newest,
		})),
	);

type ParseFileOptions = { key: string; content: string };

/** What a file would hold, without storing it. */
export const parseFile = ({ key, content }: ParseFileOptions): Batch<RupeaTransaction> =>
	withContext('config')((c) => parse(c.ledger, { key, content }));

type FormatFileOptions = { content: string };

/**
 * Writes a file as Rupea prints it, without saving it; lines that do not read
 * stay as written.
 */
export const formatFile = ({ content }: FormatFileOptions): string =>
	withContext('config')((c) => print(c.ledger, parseTree(c.ledger, { key: '', content })));

type CreateFileOptions = { ledger: Ledger; key: string; content: string };

export const createFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeaFile> =>
	writeFile({ ledger, key, content, ifVersion: null });

/**
 * Creates a file, numbering its name when it is taken, as nothing reviewed it
 * yet; the same file twice is kept once.
 */
export const importFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeaFile> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		writeNumberedText(s, key, content).andTee((f) =>
			reindex({ ledgerId: ledger.id, storage: s, changed: [f.key] }),
		),
	);

type EditFileOptions = { ledger: Ledger; key: string; content: string; version: string };

export const editFile = ({
	ledger,
	key,
	content,
	version,
}: EditFileOptions): ResultAsync<RupeaFile> =>
	writeFile({ ledger, key, content, ifVersion: version });

type CreateTransactionOptions = { ledger: Ledger; form: TransactionForm };

/**
 * Adds a form's transaction to its file, or to a new file of that name; written
 * only if the file is unchanged since it was read.
 */
export const createTransaction = ({
	ledger,
	form,
}: CreateTransactionOptions): ResultAsync<{ file: string; line: number }> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		findText(s, form.file).andThen((f) =>
			withContext('config')((c) =>
				insert(c.ledger, { file: { key: form.file, content: f?.content ?? '' }, form }),
			).asyncAndThen(({ content, line }) =>
				writeText(s, { key: form.file, content, ifVersion: f?.version ?? null })
					.andTee((w) => reindex({ ledgerId: ledger.id, storage: s, changed: [w.key] }))
					.map((w) => ({ file: w.key, line })),
			),
		),
	);

type TransactionAt = { ledger: Ledger; file: string; line: number };

type FindTransactionOptions = { ledger: Ledger; id: string };

/**
 * The form of an indexed transaction, with where it stands and the version of
 * the file it was read from.
 */
export const findTransaction = ({
	ledger,
	id,
}: FindTransactionOptions): ResultAsync<{
	file: string;
	line: number;
	form: TransactionForm;
	version: string;
}> =>
	DB.findTransactions(ledger.id, [id]).andThen(([indexed]) => {
		if (!indexed) return errAsync(fault('TransactionNotFound', { path: id, line: 0 }));

		const { file, line } = indexed.location;
		return openFolder({ ledger, folder: 'files' }).andThen((s) =>
			readText(s, file).andThen((f) =>
				withContext('config')((c) => find(c.ledger, { file: f, line })).asyncAndThen((t) =>
					okAsync({ file, line, form: t, version: f.version }),
				),
			),
		);
	});

type SaveTransactionOptions = TransactionAt & { version: string; form: TransactionForm };

/**
 * Rewrites the transaction at a line, if its file is still the version it was
 * read as. The form names the same file; a transaction does not move here.
 */
export const saveTransaction = ({
	ledger,
	file,
	line,
	version,
	form,
}: SaveTransactionOptions): ResultAsync<{ file: string; line: number }> =>
	form.file !== file
		? errAsync(fault('StorageInvalidKey', { key: form.file }))
		: changeTransaction({ ledger, file, version }, (c, f) =>
				replace(c, { file: f, line, form }),
			).map(({ line: moved }) => ({ file, line: moved }));

type DeleteTransactionOptions = TransactionAt & { version: string };

/**
 * Takes the transaction at a line out of its file, if the file is still the
 * version it was read as.
 */
export const deleteTransaction = ({
	ledger,
	file,
	line,
	version,
}: DeleteTransactionOptions): ResultAsync<void> =>
	changeTransaction({ ledger, file, version }, (c, f) =>
		remove(c, { file: f, line }).map((r) => ({ ...r, line })),
	).map(() => undefined);

type RenameFilesOptions = { ledger: Ledger; moves: Move[] };

/** Moves each file on its own, so a name already taken skips only that file. */
export const renameFiles = ({ ledger, moves }: RenameFilesOptions): ResultAsync<Batch<RupeaFile>> =>
	openFolder({ ledger, folder: 'files' }).andThen((storage) =>
		batchInOrder(moves.map((m) => () => moveFile(storage, m))).andThen((b) =>
			withFailures(
				{ ...b, succeeded: b.succeeded.map((d) => d.file) },
				reindex({ ledgerId: ledger.id, storage, moved: b.succeeded.map((d) => d.move) }),
			),
		),
	);

type AddFileOptions = { ledger: Ledger; from: string; to: string };

/**
 * What adding a draft did, with what undoing it takes: the file as it was, if
 * any, and the draft.
 */
export type Addition = {
	file: RupeaFile;
	added: number;
	skipped: number;
	before: string | null;
	draft: string;
};

/** Moves a draft to a new file, or merges it into the file there and deletes it. */
export const addFile = ({ ledger, from, to }: AddFileOptions): ResultAsync<Addition> =>
	from === to
		? errAsync(fault('StorageInvalidKey', { key: to }))
		: openFolder({ ledger, folder: 'files' }).andThen((s) =>
				readText(s, from).andThen((d) =>
					findText(s, to).andThen((f) =>
						f ? mergeFile(s, ledger.id, d, f) : moveDraft(s, ledger.id, d, to),
					),
				),
			);

type DeleteFilesOptions = { ledger: Ledger; keys: string[] };

export const deleteFiles = ({ ledger, keys }: DeleteFilesOptions): ResultAsync<Batch<string>> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		batchInOrder(keys.map((k) => () => s.delete(k).map(() => k))).andThen((b) =>
			withFailures(b, reindex({ ledgerId: ledger.id, storage: s, gone: b.succeeded })),
		),
	);

type WriteFileOptions = {
	ledger: Ledger;
	key: string;
	content: string;
	ifVersion: string | null;
};

// If indexing fails, the next sync picks the file up.
const writeFile = ({ ledger, key, content, ifVersion }: WriteFileOptions): ResultAsync<RupeaFile> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		writeText(s, { key, content, ifVersion }).andTee((f) =>
			reindex({ ledgerId: ledger.id, storage: s, changed: [f.key] }),
		),
	);

const moveFile = (storage: Storage, move: Move) =>
	storage
		.rename(move.from, move.to)
		.andThen(() => readText(storage, move.to))
		.map((f) => ({ move, file: f }));

const moveDraft = (
	s: Storage,
	ledgerId: string,
	draft: RupeaFile,
	to: string,
): ResultAsync<Addition> =>
	moveFile(s, { from: draft.key, to })
		.andTee((d) => reindex({ ledgerId, storage: s, moved: [d.move] }))
		.map((d) => ({
			file: d.file,
			added: parseFile(draft).succeeded.length,
			skipped: 0,
			before: null,
			draft: draft.content,
		}));

// Written only if the file is unchanged since it was read.
const mergeFile = (
	s: Storage,
	ledgerId: string,
	draft: RupeaFile,
	file: RupeaFile,
): ResultAsync<Addition> =>
	withContext('config')((c) => merge(c.ledger, { draft, file })).asyncAndThen((m) =>
		writeText(s, { key: file.key, content: m.content, ifVersion: file.version })
			.andThrough(() => s.delete(draft.key))
			.andTee(() => reindex({ ledgerId, storage: s, changed: [file.key], gone: [draft.key] }))
			.map((written) => ({
				file: written,
				added: m.added,
				skipped: m.skipped,
				before: file.content,
				draft: draft.content,
			})),
	);

// Every file is changed first, then all are indexed and settled together. If
// that fails, the next sync picks them up.
const withFailures = <T>(b: Batch<T>, r: ResultAsync<RupeaError[]>) =>
	r.orElse((e) => ok([e])).map((f) => ({ ...b, failed: [...b.failed, ...f] }));

type ChangeTransactionOptions = { ledger: Ledger; file: string; version: string };

const changeTransaction = (
	{ ledger, file, version }: ChangeTransactionOptions,
	change: (c: LedgerConfiguration, f: RupeaFile) => Result<{ content: string; line: number }>,
): ResultAsync<{ line: number }> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		readText(s, file).andThen((f) =>
			f.version === version
				? withContext('config')((c) => change(c.ledger, f)).asyncAndThen(({ content, line }) =>
						writeText(s, { key: file, content, ifVersion: version })
							.andTee((w) => reindex({ ledgerId: ledger.id, storage: s, changed: [w.key] }))
							.map(() => ({ line })),
					)
				: errAsync(fault('StorageConflict', { key: file, expected: version, actual: f.version })),
		),
	);
