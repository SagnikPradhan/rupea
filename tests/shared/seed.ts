import type { Database } from '#lib/server/db/index.ts';
import { StorageKind } from '#lib/server/shared/storage/storage.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { v7 as uuidv7 } from 'uuid';

export const createUser = async (db: Database) => {
	const userId = uuidv7();
	await db
		.insertInto('users')
		.values({ id: userId, email: `${userId}@example.com`, username: userId })
		.execute();
	await db.insertInto('storages').values({ userId, kind: StorageKind.Local }).execute();
	return { userId };
};

// Owned by a new user, so no other ledger shares its storage.
export const createLedger = async (db: Database): Promise<Ledger> => {
	const userId = await createUser(db).then((u) => u.userId);
	const id = uuidv7();
	await db
		.insertInto('ledgers')
		.values({ id, ownerId: userId, handle: id, name: 'Test' })
		.execute();
	return { id, handle: id, name: 'Test', owner: userId };
};
