import { StorageKind } from '#lib/server/shared/storage/storage.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { eq } from 'drizzle-orm';
import { storages } from './database-schema';

export type StorageRecord = { id: string; kind: StorageKind };

export const findStorage = (u: string): ResultAsync<StorageRecord | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ id: storages.id, kind: storages.kind })
				.from(storages)
				.where(eq(storages.userId, u))
				.limit(1)
				.then(([f]) => f ?? null),
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
				.insert(storages)
				.values({ userId: o.user, kind: o.kind })
				.onConflictDoNothing({ target: storages.userId });
		}),
	);
