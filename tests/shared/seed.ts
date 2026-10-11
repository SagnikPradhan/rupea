import { v7 as uuidv7 } from 'uuid';
import type { Database } from '#lib/server/db/index.ts';
import { ledgers, storages, users } from '#lib/server/db/schema.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';

export const createUser = async (db: Database) => {
	const userId = uuidv7();
	await db.insert(users).values({ id: userId, email: `${userId}@example.com`, username: userId });
	const [storage] = await db
		.insert(storages)
		.values({ userId, kind: 'local' })
		.returning({ id: storages.id });
	return { userId, storageId: storage?.id ?? '' };
};

// In a storage of its own, so its owner is a new user.
export const createLedger = async (db: Database): Promise<Ledger> => {
	const { userId, storageId } = await createUser(db);
	const id = uuidv7();
	await db.insert(ledgers).values({ id, storageId, handle: id, name: 'Test' });
	return { id, handle: id, name: 'Test', owner: userId };
};
