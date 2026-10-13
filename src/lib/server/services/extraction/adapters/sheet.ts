import { safely } from '#lib/server/shared/control.ts';
import { fault, unknownError } from '#lib/server/shared/result/error.ts';
import { attemptWith, errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';
import type { Grid } from '../domain/types';

// The first bytes of a zip, which an .xlsx is unless it is encrypted.
const ZIP = [0x50, 0x4b, 0x03, 0x04];

type SheetOptions = {
	name: string;
	content: Uint8Array;
};

/** An .xls, which banks also send as HTML or text; SheetJS reads whichever it is. */
export const readXls = (o: SheetOptions): ResultAsync<Grid> => readFirstSheet(o);

// SheetJS reads any bytes as some sheet, so an .xlsx that is not a zip is refused instead.
export const readXlsx = (o: SheetOptions): ResultAsync<Grid> => {
	if (isEncrypted(o.content)) return errAsync(fault('ExtractionLocked', { path: o.name }));
	if (!ZIP.every((b, i) => o.content[i] === b)) return errAsync(unreadable(o.name, 'not a zip'));

	return readFirstSheet(o);
};

type UnlockOptions = {
	name: string;
	content: Uint8Array;
	password: string;
};

export const unlockXlsx = (o: UnlockOptions): ResultAsync<Uint8Array> =>
	attemptWith({
		try: () => officeCrypto.decrypt(Buffer.from(o.content), { password: o.password }),
		catch: () => fault('ExtractionLocked', { path: o.name }),
	}).map((b) => new Uint8Array(b));

// Throws on anything too small to be an encrypted Office file.
const isEncrypted = (c: Uint8Array) =>
	safely(() => officeCrypto.isEncrypted(Buffer.from(c))) === true;

const readFirstSheet = (o: SheetOptions): ResultAsync<Grid> =>
	attemptWith({
		try: async () => {
			const book = XLSX.read(o.content, {
				type: 'buffer',
				cellDates: true,
				UTC: true,
				dense: true,
			});
			const sheet = book.Sheets[book.SheetNames[0] ?? ''];
			return sheet ? rows(sheet) : [];
		},
		catch: (t) => unreadable(o.name, 'not a readable statement', t),
	});

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
