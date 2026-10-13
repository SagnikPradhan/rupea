import { withContext } from '#lib/server/shared/context.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/prediction/application/prediction.ts';
import { findGrid, saveGrid } from '../adapters/database';
import { READER, readGrid, type Upload } from '../adapters/grid';
import { statements, type Statements } from '../adapters/statements';
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
	grid: Grid;
};

/** Stores an upload in the ledger's statements and caches the grid read from it. */
export const readStatement = (ledger: Ledger, upload: Upload): ResultAsync<Statement> =>
	readGrid(upload).andThen((g) =>
		ledgerStatements(ledger)
			.andThen((s) => s.store(upload.name, upload.content))
			.andThen(({ key, checksum }) => remember(ledger, { key, checksum, grid: g })),
	);

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
	openFolder(l, 'statements').map(statements);

const statementGrid = (l: Ledger, k: string): ResultAsync<Statement> =>
	findGrid({ ledger: l.id, statement: k, reader: READER }).andThen((f) =>
		f ? okAsync({ key: k, ...f }) : readAgain(l, k),
	);

// The cached grid expired. A locked PDF fails here, and the user reads it again with its password.
const readAgain = (ledger: Ledger, key: string): ResultAsync<Statement> =>
	ledgerStatements(ledger)
		.andThen((s) => s.read(key))
		.andThen(({ checksum, content }) =>
			readGrid({ name: key, content }).andThen((g) => remember(ledger, { key, checksum, grid: g })),
		);

const remember = (ledger: Ledger, s: Statement): ResultAsync<Statement> =>
	saveGrid({
		ledger: ledger.id,
		statement: s.key,
		reader: READER,
		checksum: s.checksum,
		grid: s.grid,
		expiresAt: new Date(Date.now() + GRID_LIFETIME),
	}).map(() => s);
