import { withContext } from '#lib/server/shared/context/context.ts';
import { batchAsync, batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import { ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import {
	findText,
	readText,
	writeNumberedText,
	writeText,
	type Storage,
} from '#lib/server/shared/storage/storage.ts';
import * as DB from '../adapters/database';
import { merge } from '../domain/merge';
import { parse, parseTree } from '../domain/parser';
import { print } from '../domain/printer';
import type { Ledger, RupeaFile, RupeaTransaction } from '../domain/types';
import { openFolder } from './ledger';
import { listLedgerFiles, reindex, type Move } from './sync';

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
