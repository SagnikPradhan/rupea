import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import { index } from '../adapters/database';
import { parse } from '../domain/parser';
import type { Ledger, RupeeFile, RupeeTransaction } from '../domain/types';
import { ledgerFiles } from './ledger';
import { indexFile, rebook, unindex } from './sync';

export const listFiles = (l: Ledger): ResultAsync<Batch<RupeeFile>> =>
	ledgerFiles(l).andThen((f) => f.list());

export const getFile = (l: Ledger, k: string): ResultAsync<RupeeFile> =>
	ledgerFiles(l).andThen((f) => f.read(k));

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

type EditFileOptions = CreateFileOptions & {
	version: string;
};

export const editFile = (options: EditFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, key, content, version } = options;
	return writeFile({ ledger, key, content, ifVersion: version });
};

type RenameFileOptions = {
	ledger: Ledger;
	from: string;
	to: string;
};

export const renameFile = (options: RenameFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, from, to } = options;
	return ledgerFiles(ledger)
		.andThen((f) => f.rename(from, to))
		.andTee(() =>
			index(ledger.id)
				.rename(from, to)
				.andThen((t) => rebook(ledger.id, { failed: [], touched: t })),
		);
};

export const deleteFile = (l: Ledger, k: string): ResultAsync<void> =>
	ledgerFiles(l)
		.andThen((f) => f.delete(k))
		.andTee(() => unindex(l.id, k).andThen((i) => rebook(l.id, i)));

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
		.andTee((w) => indexFile(ledger.id, w).andThen((i) => rebook(ledger.id, i)));
};
