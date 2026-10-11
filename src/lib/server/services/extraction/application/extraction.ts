import { withLedger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/prediction/application/prediction.ts';
import { withContext } from '#lib/server/shared/context.ts';
import type { ResultAsync } from '#lib/server/shared/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import { readGrid, type Upload } from '../adapters/grid';
import { schemas, type SchemaFile } from '../adapters/storage';
import { draft, uncategorised, type Draft } from '../domain/draft';
import { extract as run } from '../domain/runtime';
import { parseSchema } from '../domain/schema';

export type { Draft };

const ledgerSchemas = (l: string) =>
	withContext('storage')((s) => schemas(scoped(s, `ledgers/${l}/schemas`)));

export const listSchemas = (u: string) => withLedger(u, (l) => ledgerSchemas(l).list());

export const readSchema = (u: string, k: string) => withLedger(u, (l) => ledgerSchemas(l).read(k));

type SaveSchemaOptions = {
	userId: string;
	key: string;
	content: string;
};

export const saveSchema = (options: SaveSchemaOptions): ResultAsync<SchemaFile> => {
	const { userId, key, content } = options;
	return parseSchema(key, content).asyncAndThen(() =>
		withLedger(userId, (l) => ledgerSchemas(l).write(key, content)),
	);
};

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
		.andThen(({ succeeded, failed }) =>
			predictAccounts({ userId, account, lines: uncategorised(succeeded) }).map((p) =>
				withContext('config')((c) =>
					draft({
						config: c,
						statement: file.name,
						account,
						records: succeeded,
						predictions: p,
						failed,
					}),
				),
			),
		);
