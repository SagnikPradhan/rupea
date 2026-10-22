import { withContext } from '#lib/server/shared/context/context.ts';
import { batchAsync, batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import {
	readText,
	writeNumberedText,
	writeText,
	type Storage,
} from '#lib/server/shared/storage/storage.ts';
import { isCounted } from '#lib/shared/folders.ts';
import * as DB from '../adapters/database';
import { format } from '../domain/format';
import { parse } from '../domain/parser';
import type { Ledger, RupeeFile, RupeeTransaction } from '../domain/types';
import { openFolder } from './ledger';
import { indexFile, listLedgerFiles, settle, unindex, type Indexed } from './sync';

export const listFiles = (l: Ledger): ResultAsync<Batch<RupeeFile>> =>
	openFolder({ ledger: l, folder: 'files' }).andThen((s) =>
		listLedgerFiles(s).andThen((l) => batchAsync(l.map((e) => readText(s, e.key)))),
	);

type ReadFileOptions = { ledger: Ledger; key: string };

export const readFile = ({ ledger, key }: ReadFileOptions): ResultAsync<RupeeFile> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) => readText(s, key));

type FindImportedOptions = { ledger: Ledger; checksums: string[] };

/** Of these statement checksums, those a file was imported from. */
export const findImported = ({ ledger, checksums }: FindImportedOptions): ResultAsync<string[]> =>
	checksums.length === 0 ? okAsync([]) : DB.findImported(ledger.id, checksums);

type ParseFileOptions = { key: string; content: string };

/** What a file would hold, without storing it. */
export const parseFile = ({ key, content }: ParseFileOptions): Batch<RupeeTransaction> =>
	withContext('config')((c) => parse(c.ledger, { key, content }));

type FormatFileOptions = { content: string };

/** Tidies a file's whitespace without saving it. */
export const formatFile = ({ content }: FormatFileOptions): string => format(content);

type CreateFileOptions = { ledger: Ledger; key: string; content: string };

export const createFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeeFile> =>
	writeFile({ ledger, key, content, ifVersion: null });

/** Creates a file, numbering its name when it is taken, as nothing reviewed it yet; the same file twice is kept once. */
export const importFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeeFile> =>
	openFolder({ ledger, folder: 'files' })
		.andThen((s) => writeNumberedText(s, key, content))
		.andTee((f) => indexAndSettle(ledger.id, f));

type EditFileOptions = { ledger: Ledger; key: string; content: string; version: string };

export const editFile = ({
	ledger,
	key,
	content,
	version,
}: EditFileOptions): ResultAsync<RupeeFile> =>
	writeFile({ ledger, key, content, ifVersion: version });

type Move = { from: string; to: string };

type RenameFilesOptions = { ledger: Ledger; moves: Move[] };

/** Moves each file on its own, so a name already taken skips only that file. */
export const renameFiles = ({ ledger, moves }: RenameFilesOptions): ResultAsync<Batch<RupeeFile>> =>
	openFolder({ ledger, folder: 'files' }).andThen((storage) =>
		changeEach(
			ledger.id,
			moves.map((m) => () => moveFile(storage, ledger.id, m)),
		),
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
const writeFile = ({ ledger, key, content, ifVersion }: WriteFileOptions): ResultAsync<RupeeFile> =>
	openFolder({ ledger, folder: 'files' })
		.andThen((s) => writeText(s, { key, content, ifVersion }))
		.andTee((f) => indexAndSettle(ledger.id, f));

const indexAndSettle = (id: string, f: RupeeFile) =>
	indexFile({ ledgerId: id, file: f }).andThen((i) => settle({ ledgerId: id, indexed: i }));

// A move between counted and review folders changes what the file counts, so
// it is indexed again; otherwise only its key changes.
const moveFile = (storage: Storage, ledgerId: string, { from, to }: Move) =>
	storage
		.rename(from, to)
		.andThen(() => readText(storage, to))
		.andThen((file) =>
			indexed(
				file,
				DB.renameIndexedFile(ledgerId, from, to).andThen((t) =>
					isCounted(from) === isCounted(to)
						? okAsync({ failed: [], touched: t, commodities: [] })
						: indexFile({ ledgerId, file }),
				),
			),
		);

const deleteFile = (s: Storage, id: string, k: string) =>
	s.delete(k).andThen(() => indexed(k, unindex({ ledgerId: id, key: k })));

type Changed<T> = { value: T; indexed: Indexed };

// If indexing fails, the next sync picks the file up.
const indexed = <T>(v: T, i: ResultAsync<Indexed>): ResultAsync<Changed<T>> =>
	i
		.orElse((e) => ok({ failed: [e], touched: [], commodities: [] }))
		.map((x) => ({ value: v, indexed: x }));

// One file at a time, since embedded Postgres has one connection, and
// settled once for them all.
const changeEach = <T>(ledgerId: string, steps: (() => ResultAsync<Changed<T>>)[]) =>
	batchInOrder(steps).andThen((b) => {
		const changed = b.succeeded;
		const failed = [...b.failed, ...changed.flatMap((c) => c.indexed.failed)];
		const touched = changed.flatMap((c) => c.indexed.touched);
		const commodities = changed.flatMap((c) => c.indexed.commodities);
		return settle({ ledgerId, indexed: { failed, touched, commodities } }).map((f) => ({
			succeeded: changed.map((c) => c.value),
			failed: f,
		}));
	});
