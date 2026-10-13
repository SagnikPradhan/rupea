import { withContext } from '#lib/server/shared/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/prediction/application/prediction.ts';
import { findGrid, saveGrid } from '../adapters/database';
import { isReadable, READER, readGrid, unlock, type Upload } from '../adapters/grid';
import { statements, type Statements, type StoredStatement } from '../adapters/statements';
import { schemas, type SchemaFile, type Schemas } from '../adapters/storage';
import { categorised, draft, uncategorised, type Draft } from '../domain/draft';
import { extract as run } from '../domain/runtime';
import { parseSchema } from '../domain/schema';
import type { Grid } from '../domain/types';

export type { Draft };

const GRID_LIFETIME = 24 * 60 * 60 * 1000;

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

export type Statement = {
	key: string;
	checksum: string;
	original: string | null;
	grid: Grid;
};

/** Stores an upload in the ledger's statements, once per content, and reads it. A locked one is kept to unlock. */
export const readStatement = (ledger: Ledger, upload: Upload): ResultAsync<Statement> =>
	isReadable(upload.name)
		? ledgerStatements(ledger)
				.andThen((s) => s.store(upload.name, upload.content))
				.andThen(gridOf)
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
			.andThen(gridOf),
	);
};

type ExtractOptions = {
	ledger: Ledger;
	statement: string;
	schema: { key: string; content: string };
	account: string;
};

export const extract = (options: ExtractOptions): ResultAsync<Draft> => {
	const { ledger, statement, schema, account } = options;

	return statementGrid(ledger, statement).andThen(({ checksum, grid }) =>
		parseSchema(schema.key, schema.content)
			.andThen((s) => run({ schema: s, file: statement, grid }))
			.asyncAndThen(({ succeeded, failed }) =>
				predictAccounts({ ledger, account, lines: uncategorised(succeeded) }).map((p) =>
					withContext('config')((c) =>
						draft({
							config: c,
							statement,
							checksum,
							account,
							records: [...categorised(succeeded), ...p],
							failed,
						}),
					),
				),
			),
	);
};

const ledgerStatements = (l: Ledger): ResultAsync<Statements> =>
	openFolder(l, 'statements').map((s) => statements(s, l.id));

const statementGrid = (l: Ledger, k: string): ResultAsync<Statement> =>
	ledgerStatements(l).andThen((s) =>
		s
			.find(k)
			.andThen(({ checksum, original }) =>
				findGrid({ checksum, reader: READER }).andThen((g) =>
					g ? okAsync({ key: k, checksum, original, grid: g }) : s.read(k).andThen(gridOf),
				),
			),
	);

// Grids are cached by content, so the same statement in another ledger is not read twice.
const gridOf = (s: StoredStatement): ResultAsync<Statement> =>
	findGrid({ checksum: s.checksum, reader: READER }).andThen((g) =>
		g
			? okAsync(statementOf(s, g))
			: readGrid({ name: s.key, content: s.content }).andThen((r) => remember(statementOf(s, r))),
	);

const statementOf = (s: StoredStatement, grid: Grid): Statement => ({
	key: s.key,
	checksum: s.checksum,
	original: s.original,
	grid,
});

const remember = (s: Statement): ResultAsync<Statement> =>
	saveGrid({
		checksum: s.checksum,
		reader: READER,
		grid: s.grid,
		expiresAt: new Date(Date.now() + GRID_LIFETIME),
	}).map(() => s);
