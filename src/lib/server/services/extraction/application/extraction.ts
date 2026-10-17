import { withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { batchAsync, type Batch } from '#lib/server/shared/result/batch.ts';
import { err, errAsync, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/prediction/application/prediction.ts';
import { builtinSchemas } from '../adapters/builtin';
import { findContents, saveContents } from '../adapters/database';
import { isReadable, READER, readContents, unlock, type Upload } from '../adapters/grid';
import { statements, type Statements, type StoredStatement } from '../adapters/statements';
import { schemas, type SchemaFile, type Schemas } from '../adapters/storage';
import { categorised, draft, uncategorised, type Draft } from '../domain/draft';
import { recognise, type Candidate } from '../domain/recognition';
import { extract as run } from '../domain/runtime';
import { parseSchema } from '../domain/schema';
import type { Contents, Grid, RupeeRecord } from '../domain/types';
import { basename } from 'node:path';

export type { Draft };

const CONTENTS_LIFETIME = 24 * 60 * 60 * 1000;

const ledgerSchemas = (l: Ledger): ResultAsync<Schemas> => openFolder(l, 'schemas').map(schemas);

export const listSchemas = (l: Ledger) => ledgerSchemas(l).andThen((s) => s.list());
export const readSchema = (l: Ledger, k: string) => ledgerSchemas(l).andThen((s) => s.read(k));
export const deleteSchema = (l: Ledger, k: string) => ledgerSchemas(l).andThen((s) => s.delete(k));

type SaveSchemaOptions = {
	ledger: Ledger;
	key: string;
	content: string;
};

export const saveSchema = (options: SaveSchemaOptions): ResultAsync<SchemaFile> => {
	const { ledger, key, content } = options;
	return parseSchema(key, content).asyncAndThen(() =>
		ledgerSchemas(ledger).andThen((s) => s.write(key, content)),
	);
};

type SchemaText = { key: string; content: string };

/** Copies the built-in schema an import used into the ledger, which then reads such statements its own way. */
export const keepSchema = (ledger: Ledger, schema: SchemaText): ResultAsync<void> => {
	const builtin = builtins.some((b) => b.key === schema.key && b.content === schema.content);
	if (!builtin) return okAsync(undefined);

	return ledgerSchemas(ledger).andThen((s) =>
		s
			.list()
			.andThen((e) =>
				e.some((f) => f.key === schema.key)
					? okAsync(undefined)
					: s.write(schema.key, schema.content),
			)
			.map(() => undefined),
	);
};

export type Statement = {
	key: string;
	checksum: string;
	original: string | null;
	grid: Grid;
	text: string[];
};

/** Stores an upload in the ledger's statements, once per content, and reads it. A locked one is kept to unlock. */
export const readStatement = (ledger: Ledger, upload: Upload): ResultAsync<Statement> =>
	isReadable(upload.name)
		? ledgerStatements(ledger)
				.andThen((s) => s.store(upload.name, upload.content))
				.andThen(contentsOf)
		: errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));

type UnlockOptions = {
	ledger: Ledger;
	statement: string;
	password: string;
};

/** Replaces a locked statement with its content unlocked. The password is not kept. */
export const unlockStatement = (options: UnlockOptions): ResultAsync<Statement> => {
	const { ledger, statement, password } = options;
	return ledgerStatements(ledger).andThen((s) =>
		s
			.read(statement)
			.andThen(({ content }) => unlock({ name: statement, content, password }))
			.andThen((c) => s.replace(statement, c))
			.andThen(contentsOf),
	);
};

/** The schema that reads a statement: one of the ledger's, or a built-in one when none of the ledger's match. */
export const recogniseStatement = (ledger: Ledger, statement: string): ResultAsync<Recognised> =>
	statementContents(ledger, statement).andThen(({ grid, text }) =>
		ledgerCandidates(ledger).andThen((l) =>
			recognise({ statement: basename(statement), grid, text, ledger: l, builtin: builtins }).map(
				(c) => ({ key: c.key, content: c.content, builtin: !l.includes(c) }),
			),
		),
	);

export type Recognised = { key: string; content: string; builtin: boolean };

type ExtractOptions = {
	ledger: Ledger;
	statement: string;
	schema: SchemaText;
};

export const extract = (options: ExtractOptions): ResultAsync<Draft> => {
	const { ledger, statement, schema } = options;

	return withAccount(schema).asyncAndThen(({ parsed, account }) =>
		statementContents(ledger, statement).andThen((s) =>
			run({ schema: parsed, file: statement, grid: s.grid }).asyncAndThen((r) =>
				drafted({ ledger, statement: s, account, records: r }),
			),
		),
	);
};

const withAccount = (s: SchemaText) =>
	parseSchema(s.key, s.content).andThen((p) =>
		p.account
			? ok({ parsed: p, account: p.account })
			: err(fault('ExtractionWithoutAccount', { path: s.key })),
	);

type DraftedOptions = {
	ledger: Ledger;
	statement: Statement;
	account: string;
	records: Batch<RupeeRecord>;
};

const drafted = (options: DraftedOptions): ResultAsync<Draft> => {
	const { ledger, statement, account, records } = options;
	return predictAccounts({ ledger, account, lines: uncategorised(records.succeeded) }).map((p) =>
		withContext('config')((c) =>
			draft({
				config: c,
				statement: statement.key,
				checksum: statement.checksum,
				original: statement.original,
				account,
				records: [...categorised(records.succeeded), ...p],
				failed: records.failed,
			}),
		),
	);
};

// A schema that does not parse cannot recognise anything, and does not stop the others.
const ledgerCandidates = (l: Ledger): ResultAsync<Candidate[]> =>
	ledgerSchemas(l)
		.andThen((s) => s.list().andThen((e) => batchAsync(e.map((f) => s.read(f.key)))))
		.map((b) => candidates(b.succeeded));

const candidates = (texts: SchemaText[]): Candidate[] =>
	texts.flatMap((t) => {
		const parsed = parseSchema(t.key, t.content);
		return parsed.isOk() ? [{ key: t.key, content: t.content, schema: parsed.value }] : [];
	});

const builtins = candidates(builtinSchemas());

const ledgerStatements = (l: Ledger): ResultAsync<Statements> =>
	openFolder(l, 'statements').map((s) => statements(s, l.id));

const statementContents = (l: Ledger, k: string): ResultAsync<Statement> =>
	ledgerStatements(l).andThen((s) =>
		s
			.find(k)
			.andThen(({ checksum, original }) =>
				findContents({ checksum, reader: READER }).andThen((c) =>
					c ? okAsync({ key: k, checksum, original, ...c }) : s.read(k).andThen(readFresh),
				),
			),
	);

// Contents are cached by checksum, so the same statement in another ledger is not read twice.
const contentsOf = (s: StoredStatement): ResultAsync<Statement> =>
	findContents({ checksum: s.checksum, reader: READER }).andThen((c) =>
		c ? okAsync(statementOf(s, c)) : readFresh(s),
	);

const readFresh = (s: StoredStatement): ResultAsync<Statement> =>
	readContents({ name: s.key, content: s.content }).andThen((r) => remember(statementOf(s, r)));

const statementOf = (s: StoredStatement, c: Contents): Statement => ({
	key: s.key,
	checksum: s.checksum,
	original: s.original,
	...c,
});

const remember = (s: Statement): ResultAsync<Statement> =>
	saveContents({
		checksum: s.checksum,
		reader: READER,
		contents: { grid: s.grid, text: s.text },
		expiresAt: new Date(Date.now() + CONTENTS_LIFETIME),
	}).map(() => s);
