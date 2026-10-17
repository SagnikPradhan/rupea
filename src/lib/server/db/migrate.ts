import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

// Any number, as long as every instance uses the same one.
const MIGRATION_LOCK = 7_265_783;

const MIGRATIONS = 'drizzle';

export const migrate = async (p: Pool) => {
	await using lock = await withLock(p, MIGRATION_LOCK);
	await migrateNodePostgres(drizzle({ client: lock.client, casing: 'snake_case' }), {
		migrationsFolder: MIGRATIONS,
	});
};

const withLock = async (pool: Pool, key: number) => {
	const client = await pool.connect();
	await client.query('SELECT pg_advisory_lock($1)', [key]).catch((e: unknown) => {
		client.release(true);
		return Promise.reject(e);
	});

	return {
		client,
		[Symbol.asyncDispose]: () =>
			client
				.query('SELECT pg_advisory_unlock($1)', [key])
				.catch(() => undefined)
				.then(() => client.release()),
	};
};
