/** A migrated SQLite database in a temp directory, for tests to throw away. */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const migrate = (p: string) =>
	promisify(execFile)('node_modules/.bin/prisma', ['db', 'migrate'], {
		env: { ...process.env, DATABASE_PATH: p },
	});

export const createTemporaryDatabase = async () => {
	const directory = await mkdtemp(join(tmpdir(), 'rupee-db-'));
	const path = join(directory, 'rupee.db');
	await migrate(path);
	return { directory, path, dispose: () => rm(directory, { recursive: true, force: true }) };
};
