import { connectDatabase, type DatabaseHandle } from '#lib/server/db/index.ts';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

// Migrated once per run by `postgres.ts`; every test file gets a copy.
export const TEMPLATE = 'rupee_template';

export const createTemporaryDatabase = async (): Promise<DatabaseHandle> => {
	const server = inject('postgres');
	const name = `test_${randomUUID().replaceAll('-', '')}`;
	await admin(server, `create database ${name} template ${TEMPLATE}`);

	const handle = await connectDatabase(at(server, name));
	const close = async () => {
		await handle.close();
		await admin(server, `drop database ${name}`);
	};
	return { ...handle, close };
};

export const at = (server: string, database: string) => {
	const url = new URL(server);
	url.pathname = `/${database}`;
	return url.href;
};

export const admin = async (server: string, sql: string) => {
	const client = new pg.Client(server);
	await client.connect();
	await client.query(sql);
	await client.end();
};
