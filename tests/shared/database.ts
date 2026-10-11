import { PGlite } from '@electric-sql/pglite';
import { embedDatabase, extensions, type DatabaseHandle } from '#lib/server/db/index.ts';

const MIGRATIONS = 'drizzle';

const migrated = async () => {
	const client = new PGlite({ extensions });
	await embedDatabase(client, MIGRATIONS).migrate();
	const dump = await client.dumpDataDir('none');
	await client.close();
	return dump;
};

// Migrated once per test file; every database after starts from its dump.
export const template = migrated();

export const createTemporaryDatabase = async (): Promise<DatabaseHandle> =>
	embedDatabase(new PGlite({ loadDataDir: await template, extensions }), MIGRATIONS);
