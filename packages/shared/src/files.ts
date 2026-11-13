import * as v from 'valibot';
import { InstantOut } from './dates.ts';

/** The most a ledger file or a draft of one holds, in UTF-16 code units. */
export const MOST_CONTENT = 16 * 1024 * 1024;

/** The most a draft holds when it is formatted or parsed on the spot. */
export const MOST_DRAFT = 1024 * 1024;

/** The most keys or moves one call works through. */
export const MOST_KEYS = 1000;

/**
 * Where uploads and their imports wait for review; the ledger counts nothing
 * under it.
 */
const REVIEW = '_';
export const STATEMENTS = `${REVIEW}/statements`;
export const IMPORTS = `${REVIEW}/imports`;

export const isCounted = (k: string) => !k.startsWith(`${REVIEW}/`);

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

const SEGMENT = /^(?!\.{1,2}$)[^\\\0]{1,255}$/;

/**
 * No segment is empty, a dot, past 255 characters or holding a backslash or
 * null character, so a key stays under its root.
 */
export const isPath = (k: string) => k.split('/').every((s) => SEGMENT.test(s));

/** A ledger file's key, which is its path under the ledger. */
export const Key = v.pipe(
	v.string(),
	v.nonEmpty(),
	v.maxLength(512),
	v.check(isPath, 'A key is segments between slashes, none empty or dots.'),
	v.endsWith('.rupea', 'Ledger files end in .rupea.'),
);

/** An extraction schema's key, its path under the schemas, slashes and all. */
export const SchemaKey = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty(),
	v.maxLength(512),
	v.check(isPath, 'A key is segments between slashes, none empty or dots.'),
	v.endsWith('.yml', 'Schemas end in .yml.'),
);

/** A file's text, which is bounded as a request carries it. */
export const Content = v.pipe(v.string(), v.maxLength(MOST_CONTENT));

/**
 * A draft's text, which is worked through before the reply, so what comes back
 * is bounded by what goes in.
 */
export const Draft = v.pipe(v.string(), v.maxLength(MOST_DRAFT));

/** A schema's text, which is bounded as a request carries it. */
export const SchemaContent = v.pipe(v.string(), v.maxLength(MOST_DRAFT));

/** An extraction schema as a statement is read with it, saved or not. */
export const Schema = v.object({ key: SchemaKey, content: SchemaContent });

/** A line of a file, counting from 1. */
export const Line = v.pipe(v.number(), v.integer(), v.minValue(1));

/** A stored file without its text. */
export const EntryOut = v.object({
	key: v.string(),
	size: v.number(),
	modified: InstantOut,
	version: v.string(),
});

/** A stored file with its text. */
export const FileOut = v.object({ ...EntryOut.entries, content: v.string() });

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
