import { StorageKind, storages } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result.ts';
import { eq } from 'drizzle-orm';

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

type InsertStorageOptions = {
	user: string;
	kind: StorageKind;
};

// Another request may have made it first, which is as good.
export const insertStorage = (o: InsertStorageOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insert(storages)
				.values({ userId: o.user, kind: o.kind })
				.onConflictDoNothing({ target: storages.userId });
		}),
	);
