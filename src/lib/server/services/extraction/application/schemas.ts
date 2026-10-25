import { batchAsync } from '#lib/server/shared/result/batch.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import {
	readText,
	writeText,
	type Entry,
	type Storage,
	type TextFile,
} from '#lib/server/shared/storage/storage.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import { basename } from 'node:path';
import { recognise, type ParsedSchema } from '../domain/recognition';
import { parseSchema } from '../domain/schema';
import { readStatement } from './statements';

// Bundled into the build, so they ship without reading files at runtime.
const files = import.meta.glob<string>('../schemas/*.yml', {
	query: '?raw',
	import: 'default',
	eager: true,
});

export type SchemaText = { key: string; content: string };

export const listSchemas = (l: Ledger): ResultAsync<Entry[]> => openSchemas(l).andThen(listYaml);

type SchemaOptions = { ledger: Ledger; key: string };

export const readSchema = ({ ledger, key }: SchemaOptions): ResultAsync<TextFile> =>
	openSchemas(ledger).andThen((s) => readText(s, key));

export const deleteSchema = ({ ledger, key }: SchemaOptions): ResultAsync<void> =>
	openSchemas(ledger).andThen((s) => s.delete(key));

type SaveSchemaOptions = { ledger: Ledger; key: string; content: string };

export const saveSchema = ({ ledger, key, content }: SaveSchemaOptions): ResultAsync<TextFile> =>
	parseSchema(key, content).asyncAndThen(() =>
		openSchemas(ledger).andThen((s) => writeText(s, { key, content })),
	);

/** The schemas Rupea ships for common sources. */
export const builtinSchemas = (): SchemaText[] =>
	Object.entries(files).map(([path, content]) => ({ key: basename(path), content }));

/** Whether a schema is one Rupea ships, unedited. */
export const isBuiltin = (s: SchemaText) =>
	builtins.some((b) => b.key === s.key && b.content === s.content);

type AddSchemaOptions = { ledger: Ledger; schema: SchemaText };

/** Writes a schema unless the ledger already has one by that key. */
export const addSchema = ({ ledger, schema }: AddSchemaOptions): ResultAsync<void> =>
	openSchemas(ledger).andThen((s) =>
		listYaml(s)
			.andThen((e) =>
				e.some((f) => f.key === schema.key) ? okAsync(undefined) : writeText(s, schema),
			)
			.map(() => undefined),
	);

export type Recognised = { key: string; content: string; builtin: boolean };

type RecogniseStatementOptions = { ledger: Ledger; statement: string };

/** The schema that reads a statement: one of the ledger's, or a built-in one when none of the ledger's match. */
export const recogniseStatement = ({
	ledger,
	statement,
}: RecogniseStatementOptions): ResultAsync<Recognised> =>
	readStatement({ ledger, key: statement }).andThen(({ grid, text }) =>
		ledgerParsed(ledger).andThen((l) =>
			recognise({
				statement: basename(statement),
				grid,
				text,
				schemas: { ledger: l, builtin: builtins },
			}).map((s) => ({ key: s.key, content: s.content, builtin: builtins.includes(s) })),
		),
	);

const openSchemas = (l: Ledger) => openFolder({ ledger: l, folder: 'schemas' });

const listYaml = (storage: Storage): ResultAsync<Entry[]> =>
	storage
		.list()
		.map((e) => e.filter((f) => f.key.endsWith('.yml')))
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }));

// A schema that does not parse cannot recognise anything, and does not stop the others.
const ledgerParsed = (l: Ledger): ResultAsync<ParsedSchema[]> =>
	openSchemas(l)
		.andThen((s) => listYaml(s).andThen((e) => batchAsync(e.map((f) => readText(s, f.key)))))
		.map((b) => parsed(b.succeeded));

const parsed = (texts: SchemaText[]): ParsedSchema[] =>
	texts.flatMap((t) => {
		const schema = parseSchema(t.key, t.content);
		return schema.isOk() ? [{ key: t.key, content: t.content, schema: schema.value }] : [];
	});

const builtins = parsed(builtinSchemas());
