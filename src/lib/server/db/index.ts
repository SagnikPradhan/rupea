import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle as nodePostgres } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

const MIGRATIONS = { migrationsFolder: 'drizzle' };

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

export const extensions = { vector, pg_trgm };

export const connectDatabase = (url: string): DatabaseHandle => {
	const pool = new Pool({ connectionString: url });
	const orm = nodePostgres({ client: pool, casing: 'snake_case' });
	return {
		orm,
		migrate: () => migrateNodePostgres(orm, MIGRATIONS),
		close: () => pool.end(),
	};
};

export const embedDatabase = (client: PGlite): DatabaseHandle => {
	const orm = pglite({ client, casing: 'snake_case' });
	return {
		orm,
		migrate: () => migratePglite(orm, MIGRATIONS),
		close: () => client.close(),
	};
};

// A transaction's statements share one connection, so they go one at a time.
export const inOrder = (l: (() => Promise<unknown>)[]): Promise<void> =>
	l.reduce<Promise<void>>((p, f) => p.then(f).then(() => undefined), Promise.resolve());

type OpenOptions = { url: string | undefined; directory: string };

// Without a server to connect to, Postgres runs in-process from `directory`.
export const openDatabase = (o: OpenOptions): DatabaseHandle =>
	o.url ? connectDatabase(o.url) : embedDatabase(new PGlite(o.directory, { extensions }));
