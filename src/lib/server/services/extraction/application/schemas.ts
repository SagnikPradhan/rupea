import { batchAsync } from '#lib/server/shared/result/batch.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import { basename } from 'node:path';
import {
	builtinSchemas,
	schemas,
	type SchemaFile,
	type Schemas,
} from '../adapters/storage-schemas';
import { recognise, type ParsedSchema } from '../domain/recognition';
import { parseSchema } from '../domain/schema';
import { findStatement } from './statements';

export const listSchemas = (l: Ledger) => ledgerSchemas(l).andThen((s) => s.list());
export const readSchema = (l: Ledger, k: string) => ledgerSchemas(l).andThen((s) => s.read(k));
export const deleteSchema = (l: Ledger, k: string) => ledgerSchemas(l).andThen((s) => s.delete(k));

type SaveSchemaOptions = {
	ledger: Ledger;
	key: string;
	content: string;
};

export const saveSchema = ({ ledger, key, content }: SaveSchemaOptions): ResultAsync<SchemaFile> =>
	parseSchema(key, content).asyncAndThen(() =>
		ledgerSchemas(ledger).andThen((s) => s.write(key, content)),
	);

export type SchemaText = { key: string; content: string };

/** Whether a schema is one Rupee ships, unedited. */
export const isBuiltin = (s: SchemaText) =>
	builtins.some((b) => b.key === s.key && b.content === s.content);

/** Writes a schema unless the ledger already has one by that key. */
export const addSchema = (ledger: Ledger, schema: SchemaText): ResultAsync<void> =>
	ledgerSchemas(ledger).andThen((s) =>
		s
			.list()
			.andThen((e) =>
				e.some((f) => f.key === schema.key)
					? okAsync(undefined)
					: s.write(schema.key, schema.content),
			)
			.map(() => undefined),
	);

export type Recognised = { key: string; content: string; builtin: boolean };

/** The schema that reads a statement: one of the ledger's, or a built-in one when none of the ledger's match. */
export const recogniseStatement = (ledger: Ledger, statement: string): ResultAsync<Recognised> =>
	findStatement(ledger, statement).andThen(({ grid, text }) =>
		ledgerParsed(ledger).andThen((l) =>
			recognise({
				statement: basename(statement),
				grid,
				text,
				schemas: { ledger: l, builtin: builtins },
			}).map((s) => ({ key: s.key, content: s.content, builtin: builtins.includes(s) })),
		),
	);

const ledgerSchemas = (l: Ledger): ResultAsync<Schemas> => openFolder(l, 'schemas').map(schemas);

// A schema that does not parse cannot recognise anything, and does not stop the others.
const ledgerParsed = (l: Ledger): ResultAsync<ParsedSchema[]> =>
	ledgerSchemas(l)
		.andThen((s) => s.list().andThen((e) => batchAsync(e.map((f) => s.read(f.key)))))
		.map((b) => parsed(b.succeeded));

const parsed = (texts: SchemaText[]): ParsedSchema[] =>
	texts.flatMap((t) => {
		const schema = parseSchema(t.key, t.content);
		return schema.isOk() ? [{ key: t.key, content: t.content, schema: schema.value }] : [];
	});

const builtins = parsed(builtinSchemas());
