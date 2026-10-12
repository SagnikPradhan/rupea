import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle as nodePostgres } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { batches } from '../shared/batches';
import { migrateEmbedded, migrateServed } from './migrate';

// Well under Postgres's limit of 65535 parameters per statement.
const ROWS_PER_STATEMENT = 500;

// Both drivers answer a raw query with its rows under `rows`.
type Rows<R> = { rows: R[] };
interface QueryResult extends PgQueryResultHKT {
	type: Rows<this['row']>;
}

export type Database = PgDatabase<QueryResult>;
export type DatabaseHandle = {
	orm: Database;
	migrate: () => Promise<void>;
	close: () => Promise<void>;
};

type OpenOptions = { url: string | undefined; directory: string; migrations: string };

export const openDatabase = (o: OpenOptions): DatabaseHandle =>
	o.url
		? connectDatabase(o.url, o.migrations)
		: embedDatabase({ dataDir: o.directory }, o.migrations);

const connectDatabase = (url: string, migrations: string): DatabaseHandle => {
	const pool = new Pool({ connectionString: url });
	return {
		orm: nodePostgres({ client: pool, casing: 'snake_case' }),
		migrate: () => migrateServed(pool, migrations),
		close: () => pool.end(),
	};
};

export type EmbedOptions = { dataDir?: string; loadDataDir?: Blob };

export const embedDatabase = (o: EmbedOptions, migrations: string) => {
	const client = new PGlite({ ...o, extensions: { vector } });
	const orm = pglite({ client, casing: 'snake_case' });
	return {
		orm,
		client,
		migrate: () => migrateEmbedded(orm, migrations),
		close: () => client.close(),
	};
};

export const statementChunks = <T>(l: T[]): T[][] => batches(l, ROWS_PER_STATEMENT);
