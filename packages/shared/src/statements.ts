import * as v from 'valibot';
import { isPath } from './files.ts';

/**
 * Ledger files Rupea reads as they are written: its own, and ledger's and
 * hledger's in the syntax they share.
 */
export const TEXT_EXTENSIONS = ['.rupea', '.ledger', '.journal', '.dat', '.txt'];

/** Statements a schema reads, then ledger files, which import on their own. */
export const UPLOAD_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.pdf', ...TEXT_EXTENSIONS];

/** A ledger file already, which imports as it is written, with no schema. */
export const isLedgerFile = (n: string) => TEXT_EXTENSIONS.some((e) => n.toLowerCase().endsWith(e));

/** The most one statement holds, in bytes. */
export const MOST_STATEMENT = 25 * 1024 * 1024;

/** The most statements one upload carries. */
export const MOST_UPLOADS = 50;

/** The longest name a file has on common file systems, in bytes. */
export const MOST_NAME = 255;

/** The longest password a statement is unlocked with. */
export const MOST_PASSWORD = 256;

/** A statement's key: the day it was stored and the name it was uploaded under. */
export const StatementKey = v.pipe(
	v.string(),
	v.nonEmpty(),
	v.maxLength(512),
	v.check(isPath, 'A key is segments between slashes, none empty or dots.'),
);

/**
 * A statement as uploaded: a file up to the size bound whose name is one key
 * segment of at most 255 bytes, as it becomes part of the key.
 */
export const Upload = v.pipe(
	v.file(),
	v.maxSize(MOST_STATEMENT),
	v.check((f) => isPath(f.name) && !f.name.includes('/'), 'A name is one segment.'),
	v.check((f) => new TextEncoder().encode(f.name).length <= MOST_NAME, 'A name is 255 bytes.'),
);
