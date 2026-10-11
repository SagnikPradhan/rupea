import { v7 as uuidv7 } from 'uuid';
import type { Database } from '#lib/server/db/index.ts';
import { ledgers, users } from '#lib/server/db/schema.ts';

export const createLedger = async (db: Database) => {
	const id = uuidv7();
	await db.insert(ledgers).values({ id, name: 'Test' });
	return id;
};

export const createUser = async (db: Database) => {
	const ledgerId = await createLedger(db);
	const userId = uuidv7();
	await db.insert(users).values({ id: userId, email: `${ledgerId}@example.com`, ledgerId });
	return { userId, ledgerId };
};
