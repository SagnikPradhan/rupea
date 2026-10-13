import { fault, unknownError } from '#lib/server/shared/result/error.ts';
import { attemptWith, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { parse } from 'csv-parse/sync';
import { extname } from 'node:path';
import type { Grid } from '../domain/types';
import { readPdf, unlockPdf } from './pdf';
import { readXls, readXlsx, unlockXlsx } from './sheet';

// Grids read by another version are read again; bump it when reading changes.
export const READER = '3';

export type Upload = {
	name: string;
	content: Uint8Array;
};

type LockedUpload = {
	name: string;
	content: Uint8Array;
	password: string;
};

const throwing =
	(read: (content: Uint8Array) => Promise<Grid>) =>
	({ name, content }: Upload): ResultAsync<Grid> =>
		attemptWith({
			try: () => read(content),
			catch: (thrown) =>
				fault('CannotReadFile', {
					path: name,
					reason: 'not a readable statement',
					cause: [unknownError(thrown)],
				}),
		});

const readers: Record<string, (upload: Upload) => ResultAsync<Grid>> = {
	'.pdf': (u) => readPdf(u),
	'.csv': throwing(async (c) => parse(Buffer.from(c), { bom: true, relax_column_count: true })),
	'.xls': (u) => readXls(u),
	'.xlsx': (u) => readXlsx(u),
};

const unlockers: Record<string, (upload: LockedUpload) => ResultAsync<Uint8Array>> = {
	'.pdf': (u) => unlockPdf(u),
	'.xlsx': (u) => unlockXlsx(u),
};

export const isReadable = (n: string) => extension(n) in readers;

export const readGrid = (upload: Upload): ResultAsync<Grid> => {
	const read = readers[extension(upload.name)];
	return read ? read(upload) : errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));
};

/** The upload's content without its password. */
export const unlock = (upload: LockedUpload): ResultAsync<Uint8Array> => {
	const open = unlockers[extension(upload.name)];
	return open ? open(upload) : errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));
};

const extension = (n: string) => extname(n).toLowerCase();
