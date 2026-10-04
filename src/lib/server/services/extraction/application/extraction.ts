/**
 * Extraction use-cases, each run against the ledger of a user: reading an uploaded
 * statement into a draft `.rupee` file, and keeping the schemas that say
 * how. Schemas live in the ledger's storage under `schemas/`. Nothing here
 * writes a ledger file: the caller saves the draft once the user has
 * checked and edited it.
 */
import { withLedger } from '#lib/server/services/ledger/application/ledger.ts';
import { print } from '#lib/server/services/ledger/domain/printer.ts';
import { withContext } from '#lib/server/shared/context.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import type { ResultAsync } from '#lib/server/shared/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import { readGrid, type Upload } from '../adapters/grid';
import { schemas, type SchemaFile } from '../adapters/storage';
import { toTransaction } from '../domain/draft';
import { extract as run } from '../domain/runtime';
import { parseSchema } from '../domain/schema';

/**
 * `.rupee` text for the user to edit, the key to save it under (named after
 * the statement), and the rows that did not read.
 */
export type Draft = { key: string; content: string; failed: RupeeError[] };

const ledgerSchemas = (l: string) =>
	withContext('storage')((s) => schemas(scoped(s, `ledgers/${l}/schemas`)));

export const listSchemas = (u: string) => withLedger(u, (l) => ledgerSchemas(l).list());

export const readSchema = (u: string, k: string) => withLedger(u, (l) => ledgerSchemas(l).read(k));

type SaveSchemaOptions = {
	userId: string;
	key: string;
	content: string;
};

/** Save a schema, refusing one that does not parse. */
export const saveSchema = (options: SaveSchemaOptions): ResultAsync<SchemaFile> => {
	const { userId, key, content } = options;
	return parseSchema(key, content).asyncAndThen(() =>
		withLedger(userId, (l) => ledgerSchemas(l).write(key, content)),
	);
};

/**
 * Read the statement `file` with the schema at `schema` into a draft, every
 * record a transaction of `account`. Rows that do not read are left out of
 * the draft and reported with it.
 */
export const extract = (
	userId: string,
	{
		schema: key,
		file,
		account,
	}: {
		schema: string;
		file: Upload;
		account: string;
	},
): ResultAsync<Draft> =>
	readSchema(userId, key)
		.andThen((s) => parseSchema(key, s.content))
		.andThen((s) => readGrid(file).andThen((g) => run({ schema: s, file: file.name, grid: g })))
		.map(({ succeeded, failed }) =>
			withContext('config')((config) => ({
				key: `imports/${file.name.replace(/\.[^.]*$/, '')}.rupee`,
				content: print(config, succeeded.map(toTransaction(account))),
				failed,
			})),
		);
