import { embedDatabase, type DatabaseHandle } from '#lib/server/db/index.ts';

const MIGRATIONS = 'drizzle';

const migrated = async () => {
	const handle = embedDatabase({}, MIGRATIONS);
	await handle.migrate();
	const dump = await handle.client.dumpDataDir('none');
	await handle.close();
	return dump;
};

// Migrated once per test file; every database after starts from its dump.
export const template = migrated();

export const createTemporaryDatabase = async (): Promise<DatabaseHandle> =>
	embedDatabase({ loadDataDir: await template }, MIGRATIONS);
