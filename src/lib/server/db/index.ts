import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { startServer } from 'portable-pg';
import { batches } from '../shared/batches';
import { migrate } from './migrate';

// Well under Postgres's limit of 65535 parameters per statement.
const ROWS_PER_STATEMENT = 500;

export type Database = NodePgDatabase;

export type DatabaseHandle = {
	orm: Database;
	/** Where other processes reach the same database. */
	url: string;
	migrate: () => Promise<void>;
	close: () => Promise<void>;
};

type OpenOptions = { url: string | null; directory: string };

export const openDatabase = (o: OpenOptions): Promise<DatabaseHandle> =>
	o.url ? connectDatabase(o.url) : embedDatabase(o.directory);

export const connectDatabase = async (url: string): Promise<DatabaseHandle> => {
	const pool = new Pool({ connectionString: url });
	return {
		orm: drizzle({ client: pool, casing: 'snake_case' }),
		url,
		migrate: () => migrate(pool),
		close: () => pool.end(),
	};
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

export const statementChunks = <T>(l: T[]): T[][] => batches(l, ROWS_PER_STATEMENT);

/** A vector as pgvector reads it from text. */
export const vectorText = (v: Float32Array) => `[${v.join(',')}]`;

/** Text that a LIKE pattern matches as written, with its wildcards escaped. */
export const literalLike = (t: string) => t.replace(/[\\%_]/g, '\\$&');
