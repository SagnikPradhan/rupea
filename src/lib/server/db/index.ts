import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { startServer } from 'portable-pg';
import { migrate } from './migrate';
import type { Tables } from './tables';

// Well under Postgres's limit of 65535 parameters per statement.
export const ROWS_PER_STATEMENT = 500;

export type Database = NodePgDatabase;

export type Queries = Kysely<Tables>;

export type DatabaseHandle = {
	orm: Database;
	kysely: Queries;
	/** Where other processes reach the same database. */
	url: string;
	migrate: () => Promise<void>;
	close: () => Promise<void>;
};

type OpenOptions = { url: string | null; directory: string };

export const openDatabase = (o: OpenOptions): Promise<DatabaseHandle> =>
	o.url ? connectDatabase(o.url) : embedDatabase(o.directory);

export const connectDatabase = async (url: string): Promise<DatabaseHandle> => {
	const pool = new Pool({ connectionString: url, types: columnTypes });
	return {
		orm: drizzle({ client: pool, casing: 'snake_case' }),
		kysely: new Kysely<Tables>({
			dialect: new PostgresDialect({ pool }),
			plugins: [new CamelCasePlugin()],
		}),
		url,
		migrate: () => migrate(pool),
		close: () => pool.end(),
	};
};

// Drizzle reads each column by its own type; Kysely gets what the driver returns, so dates stay text and amounts are bigints.
const columnTypes = {
	getTypeParser: (oid: number, format?: 'text' | 'binary') =>
		oid === types.builtins.DATE
			? (t: string) => t
			: oid === types.builtins.NUMERIC
				? BigInt
				: types.getTypeParser(oid, format as 'text'),
};

const embedDatabase = async (directory: string): Promise<DatabaseHandle> => {
	const server = await startServer({ directory });
	const handle = await connectDatabase(server.url);
	const close = async () => {
		await handle.close();
		await server.stop();
	};
	return { ...handle, close };
};

/** A vector as pgvector reads it from text. */
export const vectorText = (v: Float32Array) => `[${v.join(',')}]`;

/** Text that a LIKE pattern matches as written, with its wildcards escaped. */
export const literalLike = (t: string) => t.replace(/[\\%_]/g, '\\$&');
