import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { extname } from 'node:path';
import type { Contents } from '../domain/types';
import { readPdf, unlockPdf } from './reader-pdf';
import { readCsv, readXls, readXlsx, unlockSheet } from './reader-sheet';

// Grids read by another version are read again; bump it when reading changes.
export const READER_VERSION = '4';

export type Upload = {
	name: string;
	content: Uint8Array;
};

type LockedUpload = {
	name: string;
	content: Uint8Array;
	password: string;
};

const readers: Record<string, (upload: Upload) => ResultAsync<Contents>> = {
	'.pdf': (u) => readPdf(u),
	'.csv': (u) => readCsv(u),
	'.xls': (u) => readXls(u),
	'.xlsx': (u) => readXlsx(u),
};

const unlockers: Record<string, (upload: LockedUpload) => ResultAsync<Uint8Array>> = {
	'.pdf': (u) => unlockPdf(u),
	'.xls': (u) => unlockSheet(u),
	'.xlsx': (u) => unlockSheet(u),
};

export const isReadable = (n: string) => extension(n) in readers;

export const readContents = (upload: Upload): ResultAsync<Contents> => {
	const read = readers[extension(upload.name)];
	return read ? read(upload) : errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));
};

/** The upload's content without its password. */
export const unlock = (upload: LockedUpload): ResultAsync<Uint8Array> => {
	const open = unlockers[extension(upload.name)];
	return open ? open(upload) : errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));
};

const extension = (n: string) => extname(n).toLowerCase();
