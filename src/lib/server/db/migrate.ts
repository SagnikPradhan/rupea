import { drizzle as nodePostgres } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { Pool } from 'pg';

// Any number, as long as every instance uses the same one.
const MIGRATION_LOCK = 7_265_783;

export const migrateServed = async (p: Pool, m: string) => {
	await using lock = await withLock(p, MIGRATION_LOCK);
	await migrateNodePostgres(nodePostgres({ client: lock.client, casing: 'snake_case' }), {
		migrationsFolder: m,
	});
};

export const migrateEmbedded = (d: PgliteDatabase, m: string) =>
	migratePglite(d, { migrationsFolder: m });

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
