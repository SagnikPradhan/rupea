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
	migrate: () => Promise<void>;
	close: () => Promise<void>;
};

type OpenOptions = { url: string | undefined; directory: string; migrations: string };

export const openDatabase = (o: OpenOptions): Promise<DatabaseHandle> =>
	o.url ? connectDatabase(o.url, o.migrations) : embedDatabase(o.directory, o.migrations);

export const connectDatabase = async (url: string, migrations: string): Promise<DatabaseHandle> => {
	const pool = new Pool({ connectionString: url });
	return {
		orm: drizzle({ client: pool, casing: 'snake_case' }),
		migrate: () => migrate(pool, migrations),
		close: () => pool.end(),
	};
};

const embedDatabase = async (directory: string, migrations: string): Promise<DatabaseHandle> => {
	const server = await startServer({ directory });
	const handle = await connectDatabase(server.url, migrations);
	const close = async () => {
		await handle.close();
		await server.stop();
	};
	return { ...handle, close };
};

export const statementChunks = <T>(l: T[]): T[][] => batches(l, ROWS_PER_STATEMENT);
