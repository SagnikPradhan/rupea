import { fault, unknownError } from '#lib/server/shared/result/error.ts';
import { attemptWith, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { parse } from 'csv-parse/sync';
import { extname } from 'node:path';
import { readSheet } from 'read-excel-file/node';
import type { Grid } from '../domain/types';
import { readPdf } from './pdf';

// Grids read by another version are read again; bump it when reading changes.
export const READER = '1';

export type Upload = {
	name: string;
	content: Uint8Array;
	password?: string | undefined;
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
	'.xlsx': throwing((c) => readSheet(Buffer.from(c)).then((r) => r.map((w) => w.map(xlsxToText)))),
};

const xlsxToText = (cell: unknown): string => {
	if (cell === null || cell === undefined) return '';
	if (cell instanceof Date) return cell.toISOString().slice(0, 10);
	return String(cell);
};

export const readGrid = (upload: Upload): ResultAsync<Grid> => {
	const read = readers[extname(upload.name).toLowerCase()];
	return read ? read(upload) : errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));
};
