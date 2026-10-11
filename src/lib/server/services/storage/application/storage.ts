import { StorageKind } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { err, ok, okAsync, type Result, type ResultAsync } from '#lib/server/shared/result.ts';
import type { Storage } from '#lib/server/shared/storage/storage.ts';
import { findStorage, insertStorage, type StorageRecord } from '../adapters/database';

export type { StorageRecord };

// Until there is a choice, every storage is local.
const DEFAULT_KIND = StorageKind.Local;

type WithStorageOptions<T> = {
	user: string;
	action: (storage: Storage) => Result<T> | ResultAsync<T>;
};

// The one place that opens a user's storage.
export const withStorage = <T>(o: WithStorageOptions<T>): ResultAsync<T> =>
	ensureStorage(o.user).andThen((s) => withContext('storages')((t) => o.action(t[s.kind](o.user))));

// Made on first use, so every user has one without sign-up making it.
export const ensureStorage = (u: string): ResultAsync<StorageRecord> =>
	findStorage(u).andThen((f) =>
		f ? okAsync(f) : insertStorage({ user: u, kind: DEFAULT_KIND }).andThen(() => found(u)),
	);

const found = (u: string): ResultAsync<StorageRecord> =>
	findStorage(u).andThen((f): Result<StorageRecord> =>
		f ? ok(f) : err({ type: 'StorageMissing', userId: u, cause: [] }),
	);
