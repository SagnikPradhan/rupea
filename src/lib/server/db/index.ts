import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle as nodePostgres } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

// Any number, as long as every instance uses the same one.
const MIGRATION_LOCK = 7_265_783;

// Well under Postgres's limit of 65535 parameters per statement.
export const ROWS_PER_STATEMENT = 500;

type Rows<R> = { rows: R[] };

// Both drivers answer a raw query with its rows under `rows`.
export interface QueryResult extends PgQueryResultHKT {
	type: Rows<this['row']>;
}

export type Database = PgDatabase<QueryResult>;

export type DatabaseHandle = {
	orm: Database;
	migrate: () => Promise<void>;
	close: () => Promise<void>;
};

export const extensions = { vector };

export const connectDatabase = (url: string, migrations: string): DatabaseHandle => {
	const pool = new Pool({ connectionString: url });
	const orm = nodePostgres({ client: pool, casing: 'snake_case' });
	return {
		orm,
		migrate: () => migrateLocked(pool, migrations),
		close: () => pool.end(),
	};
};

// Instances starting together take turns; the later ones find nothing to do.
// The lock belongs to a session, so it and the migration share one connection.
const migrateLocked = (pool: Pool, migrations: string): Promise<void> =>
	pool.connect().then((client) =>
		client
			.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
			.then(() =>
				migrateNodePostgres(nodePostgres({ client, casing: 'snake_case' }), {
					migrationsFolder: migrations,
				}),
			)
			.finally(() =>
				client
					.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
					.catch(() => undefined)
					.then(() => client.release()),
			),
	);

export const embedDatabase = (client: PGlite, migrations: string): DatabaseHandle => {
	const orm = pglite({ client, casing: 'snake_case' });
	return {
		orm,
		migrate: () => migratePglite(orm, { migrationsFolder: migrations }),
		close: () => client.close(),
	};
};

// A transaction's statements share one connection, so they go one at a time.
export const inOrder = (l: (() => Promise<unknown>)[]): Promise<void> =>
	l.reduce<Promise<void>>((p, f) => p.then(f).then(() => undefined), Promise.resolve());

type OpenOptions = { url: string | undefined; directory: string; migrations: string };

// Without a server to connect to, Postgres runs in-process from `directory`.
export const openDatabase = (o: OpenOptions): DatabaseHandle =>
	o.url
		? connectDatabase(o.url, o.migrations)
		: embedDatabase(new PGlite(o.directory, { extensions }), o.migrations);
