import { withContext } from '#lib/server/shared/context.ts';
import { ok, type ResultAsync } from '#lib/server/shared/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import { withStorage, type Ledger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/prediction/application/prediction.ts';
import { readGrid, type Upload } from '../adapters/grid';
import { schemas, type SchemaFile, type Schemas } from '../adapters/storage';
import { categorised, draft, uncategorised, type Draft } from '../domain/draft';
import { extract as run } from '../domain/runtime';
import { parseSchema } from '../domain/schema';

export type { Draft };

// A user's schemas serve every ledger they import into.
const userSchemas = (u: string): ResultAsync<Schemas> =>
	withStorage({ user: u, action: (s) => ok(schemas(scoped(s, 'schemas'))) });

export const listSchemas = (u: string) => userSchemas(u).andThen((s) => s.list());

export const readSchema = (u: string, k: string) => userSchemas(u).andThen((s) => s.read(k));

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

// `user` imports with their own schema into `ledger`, which may be someone else's.
type ExtractOptions = {
	user: string;
	ledger: Ledger;
	schema: string;
	file: Upload;
	account: string;
};

export const extract = (options: ExtractOptions): ResultAsync<Draft> => {
	const { user, ledger, schema: key, file, account } = options;
	return readSchema(user, key)
		.andThen((s) => parseSchema(key, s.content))
		.andThen((s) => readGrid(file).andThen((g) => run({ schema: s, file: file.name, grid: g })))
		.andThen(({ succeeded, failed }) =>
			predictAccounts({ ledger, account, lines: uncategorised(succeeded) }).map((p) =>
				withContext('config')((c) =>
					draft({
						config: c,
						statement: file.name,
						account,
						records: [...categorised(succeeded), ...p],
						failed,
					}),
				),
			),
		);
};
