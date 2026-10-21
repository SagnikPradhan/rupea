import { withContext } from '#lib/server/shared/context/context.ts';
import { batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { index } from '../adapters/database';
import { isCounted } from '#lib/shared/folders.ts';
import { parse } from '../domain/parser';
import type { Ledger, RupeeFile, RupeeTransaction } from '../domain/types';
import { ledgerFiles } from './ledger';
import { indexFile, rebook, unindex, type Indexed } from './sync';

export const listFiles = (l: Ledger): ResultAsync<Batch<RupeeFile>> =>
	ledgerFiles(l).andThen((f) => f.list());

export const getFile = (l: Ledger, k: string): ResultAsync<RupeeFile> =>
	ledgerFiles(l).andThen((f) => f.read(k));

/** Of these statement checksums, those a file was imported from. */
export const findImported = (l: Ledger, c: string[]): ResultAsync<string[]> =>
	c.length === 0 ? okAsync([]) : index(l.id).imported(c);

/** What a file would hold, without storing it. */
export const parseFile = (k: string, c: string): Batch<RupeeTransaction> =>
	withContext('config')((f) => parse(f.ledger, { key: k, content: c }));

type CreateFileOptions = {
	ledger: Ledger;
	key: string;
	content: string;
};

export const createFile = (o: CreateFileOptions): ResultAsync<RupeeFile> =>
	writeFile({ ...o, ifVersion: null });

/** Creates a file, numbering its name when it is taken, as nothing reviewed it yet; the same file twice is kept once. */
export const importFile = ({ ledger, key, content }: CreateFileOptions): ResultAsync<RupeeFile> =>
	ledgerFiles(ledger)
		.andThen((f) => f.writeNumbered(key, content))
		.andTee((w) => reindex(ledger.id, w));

type EditFileOptions = CreateFileOptions & {
	version: string;
};

export const editFile = (options: EditFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, key, content, version } = options;
	return writeFile({ ledger, key, content, ifVersion: version });
};

type Move = {
	from: string;
	to: string;
};

/** Moves each file on its own, so a name already taken skips only that file. */
export const renameFiles = (l: Ledger, moves: Move[]): ResultAsync<Batch<RupeeFile>> =>
	ledgerFiles(l).andThen((f) =>
		changeEach(
			l.id,
			moves.map(
				(m) => () => f.rename(m.from, m.to).andThen((r) => indexed(r, indexMove(l.id, m, r))),
			),
		),
	);

export const deleteFiles = (l: Ledger, keys: string[]): ResultAsync<Batch<string>> =>
	ledgerFiles(l).andThen((f) =>
		changeEach(
			l.id,
			keys.map((k) => () => f.delete(k).andThen(() => indexed(k, unindex(l.id, k)))),
		),
	);

type WriteFileOptions = {
	ledger: Ledger;
	key: string;
	content: string;
	ifVersion: string | null;
};

// If indexing fails, the next sync picks the file up.
const writeFile = (options: WriteFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, key, content, ifVersion } = options;
	return ledgerFiles(ledger)
		.andThen((f) => f.write({ key, content, ifVersion }))
		.andTee((w) => reindex(ledger.id, w));
};

const reindex = (id: string, f: RupeeFile) => indexFile(id, f).andThen((i) => rebook(id, i));

type Changed<T> = { value: T; indexed: Indexed };

// If indexing fails, the next sync picks the file up.
const indexed = <T>(v: T, i: ResultAsync<Indexed>): ResultAsync<Changed<T>> =>
	i.orElse((e) => ok({ failed: [e], touched: [] })).map((x) => ({ value: v, indexed: x }));

const indexMove = (id: string, m: Move, r: RupeeFile): ResultAsync<Indexed> =>
	index(id)
		.rename(m.from, m.to)
		.andThen((t) =>
			isCounted(m.from) === isCounted(m.to)
				? okAsync({ failed: [], touched: t })
				: indexFile(id, r),
		);

// One file at a time, since embedded Postgres has one connection, and
// lots rebooked once for them all.
const changeEach = <T>(id: string, steps: (() => ResultAsync<Changed<T>>)[]) =>
	batchInOrder(steps).andThen((b) => {
		const changed = b.succeeded;
		const failed = [...b.failed, ...changed.flatMap((c) => c.indexed.failed)];
		const touched = changed.flatMap((c) => c.indexed.touched);
		return rebook(id, { failed, touched }).map((f) => ({
			succeeded: changed.map((c) => c.value),
			failed: f,
		}));
	});
