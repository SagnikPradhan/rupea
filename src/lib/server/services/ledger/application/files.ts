import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { index } from '../adapters/database';
import { isCounted } from '../domain/folders';
import { parse } from '../domain/parser';
import type { Ledger, RupeeFile, RupeeTransaction } from '../domain/types';
import { ledgerFiles } from './ledger';
import { indexFile, rebook, unindex } from './sync';

export const listFiles = (l: Ledger): ResultAsync<Batch<RupeeFile>> =>
	ledgerFiles(l).andThen((f) => f.list());

export const getFile = (l: Ledger, k: string): ResultAsync<RupeeFile> =>
	ledgerFiles(l).andThen((f) => f.read(k));

/** Of these statement checksums, those some file cites. */
export const findCited = (l: Ledger, c: string[]): ResultAsync<string[]> =>
	c.length === 0 ? okAsync([]) : index(l.id).cited(c);

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

/** Creates a file, numbering its name when it is taken, as nothing reviewed it yet. */
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

type RenameFileOptions = {
	ledger: Ledger;
	from: string;
	to: string;
};

export const renameFile = (options: RenameFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, from, to } = options;
	return ledgerFiles(ledger)
		.andThen((f) => f.rename(from, to))
		.andTee((r) =>
			index(ledger.id)
				.rename(from, to)
				.andThen((t) =>
					isCounted(from) === isCounted(to)
						? rebook(ledger.id, { failed: [], touched: t })
						: reindex(ledger.id, r),
				),
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
		.andTee((w) => reindex(ledger.id, w));
};

const reindex = (id: string, f: RupeeFile) => indexFile(id, f).andThen((i) => rebook(id, i));
