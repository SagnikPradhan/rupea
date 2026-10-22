import { StorageKind } from '#lib/server/shared/storage/storage.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';

export type StorageRecord = { id: string; kind: StorageKind };

export const findStorage = (u: string): ResultAsync<StorageRecord | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('storages')
				.select(['id', 'kind'])
				.where('userId', '=', u)
				.executeTakeFirst()
				.then((f) => f ?? null),
		),
	);

type CreateStorageOptions = {
	user: string;
	kind: StorageKind;
};

// Another request may have made it first, which is as good.
export const createStorage = (o: CreateStorageOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insertInto('storages')
				.values({ userId: o.user, kind: o.kind })
				.onConflict((c) => c.column('userId').doNothing())
				.execute();
		}),
	);
