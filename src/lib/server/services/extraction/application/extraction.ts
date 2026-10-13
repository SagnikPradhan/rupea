import { withContext } from '#lib/server/shared/context.ts';
import { ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/prediction/application/prediction.ts';
import { withStorage } from '#services/storage/application/storage.ts';
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

// A user's schemas serve every ledger they import into.
const userSchemas = (u: string): ResultAsync<Schemas> =>
	withStorage({ user: u, action: (s) => ok(schemas(scoped(s, 'schemas'))) });

export const listSchemas = (u: string) => userSchemas(u).andThen((s) => s.list());
export const readSchema = (u: string, k: string) => userSchemas(u).andThen((s) => s.read(k));
export const deleteSchema = (u: string, k: string) => userSchemas(u).andThen((s) => s.delete(k));

type SaveSchemaOptions = {
	user: string;
	key: string;
	content: string;
};

export const saveSchema = (options: SaveSchemaOptions): ResultAsync<SchemaFile> => {
	const { user, key, content } = options;
	return parseSchema(key, content).asyncAndThen(() =>
		userSchemas(user).andThen((s) => s.write(key, content)),
	);
};

export type Statement = {
	key: string;
	checksum: string;
	grid: Grid;
};

/** Stores an upload in the user's statements and caches the grid read from it. */
export const readStatement = (user: string, upload: Upload): ResultAsync<Statement> =>
	readGrid(upload).andThen((g) =>
		userStatements(user)
			.andThen((s) => s.store(upload.name, upload.content))
			.andThen(({ key, checksum }) => remember(user, { key, checksum, grid: g })),
	);

type ExtractOptions = {
	user: string;
	ledger: Ledger;
	statement: string;
	schema: { key: string; content: string };
	account: string;
};

/** `user` imports with their own statement and schema into `ledger`, which may be someone else's. */
export const extract = (options: ExtractOptions): ResultAsync<Draft> => {
	const { user, ledger, statement, schema, account } = options;

	return statementGrid(user, statement).andThen(({ checksum, grid }) =>
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

const userStatements = (u: string): ResultAsync<Statements> =>
	withStorage({ user: u, action: (s) => ok(statements(scoped(s, 'statements'))) });

const statementGrid = (u: string, k: string): ResultAsync<Statement> =>
	findGrid({ user: u, statement: k, reader: READER }).andThen((f) =>
		f ? okAsync({ key: k, ...f }) : readAgain(u, k),
	);

// The cached grid expired. A locked PDF fails here, and the user reads it again with its password.
const readAgain = (user: string, key: string): ResultAsync<Statement> =>
	userStatements(user)
		.andThen((s) => s.read(key))
		.andThen(({ checksum, content }) =>
			readGrid({ name: key, content }).andThen((g) => remember(user, { key, checksum, grid: g })),
		);

const remember = (user: string, s: Statement): ResultAsync<Statement> =>
	saveGrid({
		user,
		statement: s.key,
		reader: READER,
		checksum: s.checksum,
		grid: s.grid,
		expiresAt: new Date(Date.now() + GRID_LIFETIME),
	}).map(() => s);
