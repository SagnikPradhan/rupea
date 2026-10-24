import { safely } from '#lib/server/shared/control.ts';
import { fault, unknownError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import officeCrypto from 'officecrypto-tool';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import type { Contents, Grid, LockedUpload, Upload } from '../domain/types';

// The first bytes of a zip, which an .xlsx is unless it is encrypted.
const ZIP = [0x50, 0x4b, 0x03, 0x04];

export const readCsv = (o: Upload): ResultAsync<Contents> =>
	attempt(
		() => ({
			grid: parse(Buffer.from(o.content), { bom: true, relax_column_count: true }),
			text: [],
		}),
		(t) => unreadable(o.name, 'not a readable statement', t),
	);

/** An .xls, which banks also send as HTML or text; SheetJS reads whichever it is. */
export const readXls = (o: Upload): ResultAsync<Contents> => {
	if (isEncrypted(o.content)) return errAsync(fault('ExtractionLocked', { path: o.name }));

	return readFirstSheet(o);
};

// SheetJS reads any bytes as some sheet, so an .xlsx that is not a zip is refused instead.
export const readXlsx = (o: Upload): ResultAsync<Contents> => {
	if (isEncrypted(o.content)) return errAsync(fault('ExtractionLocked', { path: o.name }));
	if (!ZIP.every((b, i) => o.content[i] === b)) return errAsync(unreadable(o.name, 'not a zip'));

	return readFirstSheet(o);
};

export const unlockSheet = (o: LockedUpload): ResultAsync<Uint8Array> =>
	attempt(
		() => officeCrypto.decrypt(Buffer.from(o.content), { password: o.password }),
		() => fault('ExtractionLocked', { path: o.name }),
	).map((b) => new Uint8Array(b));

// Throws on anything too small to be an encrypted Office file.
const isEncrypted = (c: Uint8Array) =>
	safely(() => officeCrypto.isEncrypted(Buffer.from(c))) === true;

// A sheet's every cell is in its grid, so no text is left outside it.
const readFirstSheet = (o: Upload): ResultAsync<Contents> =>
	attempt(
		() => {
			const book = XLSX.read(o.content, {
				type: 'buffer',
				cellDates: true,
				UTC: true,
				dense: true,
			});
			const sheet = book.Sheets[book.SheetNames[0] ?? ''];
			return { grid: sheet ? rows(sheet) : [], text: [] };
		},
		(t) => unreadable(o.name, 'not a readable statement', t),
	);

const rows = (sheet: XLSX.WorkSheet): Grid =>
	XLSX.utils
		.sheet_to_json<unknown[]>(sheet, {
			header: 1,
			raw: true,
			defval: '',
			blankrows: true,
			UTC: true,
		})
		.map((r) => r.map(toText));

const toText = (cell: unknown): string => {
	if (cell === null || cell === undefined) return '';
	if (cell instanceof Date) return cell.toISOString().slice(0, 10);
	return String(cell);
};

const unreadable = (path: string, reason: string, thrown?: unknown) =>
	fault('CannotReadFile', {
		path,
		reason,
		...(thrown === undefined ? {} : { cause: [unknownError(thrown)] }),
	});
