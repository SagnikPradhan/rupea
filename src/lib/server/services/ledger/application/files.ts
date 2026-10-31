import { withContext } from '#lib/server/shared/context/context.ts';
import { batchAsync, batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import {
	findText,
	readText,
	writeNumberedText,
	writeText,
	type Storage,
} from '#lib/server/shared/storage/storage.ts';
import { isCounted } from '#lib/shared/folders.ts';
import type { TransactionForm } from '#lib/shared/transaction-form.ts';
import * as DB from '../adapters/database';
import { merge } from '../domain/merge';
import { parse, parseTree } from '../domain/parser';
import { print } from '../domain/printer';
import { insert } from '../domain/transactions';
import type { Ledger, RupeaFile, RupeaTransaction } from '../domain/types';
import { openFolder } from './ledger';
import {
	exclusively,
	indexEach,
	indexFile,
	listLedgerFiles,
	settle,
	unindex,
	type Indexed,
} from './sync';

export const listFiles = (l: Ledger): ResultAsync<Batch<RupeaFile>> =>
	openFolder({ ledger: l, folder: 'files' }).andThen((s) =>
		listLedgerFiles(s).andThen((l) => batchAsync(l.map((e) => readText(s, e.key)))),
	);

type ReadFileOptions = { ledger: Ledger; key: string };

export const readFile = ({ ledger, key }: ReadFileOptions): ResultAsync<RupeaFile> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) => readText(s, key));

type FindImportedOptions = { ledger: Ledger; checksums: string[] };

/** Of these statement checksums, those a file was imported from, with each such file. */
export const findImported = ({
	ledger,
	checksums,
}: FindImportedOptions): ResultAsync<{ checksum: string; file: string }[]> =>
	checksums.length === 0 ? okAsync([]) : DB.findImported(ledger.id, checksums);

type FindLatestFileOptions = { ledger: Ledger; account: string };

/** The counted file holding an account's latest transaction, where its next ones likely go. */
export const findLatestFile = ({
	ledger,
	account,
}: FindLatestFileOptions): ResultAsync<string | null> => DB.findLatestFile(ledger.id, account);

/** The files a new transaction can go in, and the one with the ledger's latest transaction. */
export const findTransactionFiles = (
	l: Ledger,
): ResultAsync<{ keys: string[]; newest: string | null }> =>
	DB.listIndexedFiles(l.id).andThen((files) =>
		DB.findNewestFile(l.id).map((newest) => ({
			keys: files
				.map((f) => f.key)
				.filter(isCounted)
				.toSorted(),
			newest,
		})),
	);

type ParseFileOptions = { key: string; content: string };

/** What a file would hold, without storing it. */
export const parseFile = ({ key, content }: ParseFileOptions): Batch<RupeaTransaction> =>
	withContext('config')((c) => parse(c.ledger, { key, content }));

type FormatFileOptions = { content: string };

/** Writes a file as Rupea prints it, without saving it; lines that do not read stay as written. */
export const formatFile = ({ content }: FormatFileOptions): string =>
	withContext('config')((c) => print(c.ledger, parseTree(c.ledger, { key: '', content })));

type CreateFileOptions = { ledger: Ledger; key: string; content: string };

export const createFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeaFile> =>
	writeFile({ ledger, key, content, ifVersion: null });

/** Creates a file, numbering its name when it is taken, as nothing reviewed it yet; the same file twice is kept once. */
export const importFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeaFile> =>
	openFolder({ ledger, folder: 'files' })
		.andThen((s) => writeNumberedText(s, key, content))
		.andTee((f) => indexAndSettle(ledger.id, f));

type EditFileOptions = { ledger: Ledger; key: string; content: string; version: string };

export const editFile = ({
	ledger,
	key,
	content,
	version,
}: EditFileOptions): ResultAsync<RupeaFile> =>
	writeFile({ ledger, key, content, ifVersion: version });

type CreateTransactionOptions = { ledger: Ledger; form: TransactionForm };

/** Adds a form's transaction to its file, or to a new file of that name; written only if the file is unchanged since it was read. */
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
					.andTee((w) => indexAndSettle(ledger.id, w))
					.map((w) => ({ file: w.key, line })),
			),
		),
	);

type Move = { from: string; to: string };

type RenameFilesOptions = { ledger: Ledger; moves: Move[] };

/** Moves each file on its own, so a name already taken skips only that file. */
export const renameFiles = ({ ledger, moves }: RenameFilesOptions): ResultAsync<Batch<RupeaFile>> =>
	openFolder({ ledger, folder: 'files' }).andThen((storage) =>
		changeEach(
			ledger.id,
			moves.map((m) => () => moveFile(storage, ledger.id, m)),
		),
	);

type AddFileOptions = { ledger: Ledger; from: string; to: string };

/** What adding a draft did, with what undoing it takes: the file as it was, if any, and the draft. */
export type Addition = {
	file: RupeaFile;
	added: number;
	skipped: number;
	before: string | null;
	draft: string;
};

/** Moves a draft to a new file, or merges it into the file there and deletes it. */
export const addFile = ({ ledger, from, to }: AddFileOptions): ResultAsync<Addition> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		readText(s, from)
			.andThen((d) =>
				findText(s, to).andThen((f) =>
					f ? mergeFile(s, ledger.id, d, f) : moveDraft(s, ledger.id, d, to),
				),
			)
			.andTee((c) => settleChange(ledger.id, c))
			.map((c) => c.value),
	);

type DeleteFilesOptions = { ledger: Ledger; keys: string[] };

export const deleteFiles = ({ ledger, keys }: DeleteFilesOptions): ResultAsync<Batch<string>> =>
	openFolder({ ledger, folder: 'files' }).andThen((storage) =>
		changeEach(
			ledger.id,
			keys.map((k) => () => deleteFile(storage, ledger.id, k)),
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
	openFolder({ ledger, folder: 'files' })
		.andThen((s) => writeText(s, { key, content, ifVersion }))
		.andTee((f) => indexAndSettle(ledger.id, f));

const settleChange = <T>(id: string, c: Changed<T>) =>
	exclusively(id, () => c.index().andThen((i) => settle({ ledgerId: id, indexed: i })));

const indexAndSettle = (id: string, f: RupeaFile) =>
	exclusively(id, () =>
		indexFile({ ledgerId: id, file: f }).andThen((i) => settle({ ledgerId: id, indexed: i })),
	);

// A move between counted and review folders changes what the file counts, so
// it is indexed again; otherwise only its key changes.
const moveFile = (storage: Storage, ledgerId: string, { from, to }: Move) =>
	storage
		.rename(from, to)
		.andThen(() => readText(storage, to))
		.map((file) => ({
			value: file,
			index: () =>
				DB.renameIndexedFile(ledgerId, from, to).andThen((t) =>
					isCounted(from) === isCounted(to)
						? okAsync({ failed: [], ...t })
						: indexFile({ ledgerId, file }),
				),
		}));

const moveDraft = (
	s: Storage,
	ledgerId: string,
	draft: RupeaFile,
	to: string,
): ResultAsync<Changed<Addition>> =>
	moveFile(s, ledgerId, { from: draft.key, to }).map((c) => ({
		...c,
		value: {
			file: c.value,
			added: parseFile(draft).succeeded.length,
			skipped: 0,
			before: null,
			draft: draft.content,
		},
	}));

// Written only if the file is unchanged since it was read.
const mergeFile = (
	s: Storage,
	ledgerId: string,
	draft: RupeaFile,
	file: RupeaFile,
): ResultAsync<Changed<Addition>> =>
	withContext('config')((c) => merge(c.ledger, { draft, file })).asyncAndThen((m) =>
		writeText(s, { key: file.key, content: m.content, ifVersion: file.version })
			.andThrough(() => s.delete(draft.key))
			.map((written) => ({
				value: {
					file: written,
					added: m.added,
					skipped: m.skipped,
					before: file.content,
					draft: draft.content,
				},
				index: () =>
					indexEach([
						() => indexFile({ ledgerId, file: written }),
						() => unindex({ ledgerId, key: draft.key }),
					]),
			})),
	);

const deleteFile = (s: Storage, id: string, k: string) =>
	s.delete(k).map(() => ({ value: k, index: () => unindex({ ledgerId: id, key: k }) }));

type Changed<T> = { value: T; index: () => ResultAsync<Indexed> };

// Every file is changed first, then all are indexed and settled together. If
// that fails, the next sync picks them up.
const changeEach = <T>(ledgerId: string, steps: (() => ResultAsync<Changed<T>>)[]) =>
	batchInOrder(steps).andThen((b) =>
		exclusively(ledgerId, () =>
			indexEach(b.succeeded.map((c) => c.index)).andThen((i) => settle({ ledgerId, indexed: i })),
		)
			.orElse((e) => ok([e]))
			.map((f) => ({ succeeded: b.succeeded.map((c) => c.value), failed: [...b.failed, ...f] })),
	);
