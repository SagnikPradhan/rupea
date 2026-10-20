import type { Database } from '#lib/server/db/index.ts';
import { ledgers, StorageKind, storages, users } from '#lib/server/db/schema.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { v7 as uuidv7 } from 'uuid';

export const createUser = async (db: Database) => {
	const userId = uuidv7();
	await db.insert(users).values({ id: userId, email: `${userId}@example.com`, username: userId });
	await db.insert(storages).values({ userId, kind: StorageKind.Local });
	return { userId };
};

// Owned by a new user, so no other ledger shares its storage.
export const createLedger = async (db: Database): Promise<Ledger> => {
	const userId = (await createUser(db)).userId;
	const id = uuidv7();
	await db.insert(ledgers).values({ id, ownerId: userId, handle: id, name: 'Test' });
	return { id, handle: id, name: 'Test', owner: userId };
};
