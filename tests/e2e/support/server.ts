/**
 * The app, started for one Playwright worker: the build `setup.ts` made, on a
 * free port, with a throwaway database and data directory of its own.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { openDatabase, type Database } from '#lib/server/db/index.ts';
import { createTemporaryDatabase } from '#tests/shared/database.ts';

export type Server = { url: string; db: Database };

const freePort = () =>
	new Promise<number>((done, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			probe.close(() => done(typeof address === 'object' && address ? address.port : 0));
		});
	});

const untilUp = async (url: string): Promise<void> => {
	const up = await fetch(url).then(
		() => true,
		() => false,
	);
	if (up) return;
	await new Promise((r) => setTimeout(r, 100));
	return untilUp(url);
};

/** Run `use` against a fresh server, stopping it and removing its data afterwards. */
export const withServer = async (use: (server: Server) => Promise<void>) => {
	const database = await createTemporaryDatabase();
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const child = spawn('node', ['build'], {
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			// adapter-node assumes https unless a header says otherwise.
			PROTOCOL_HEADER: 'x-forwarded-proto',
			DATABASE_PATH: database.path,
			RUPEE_DATA_DIR: database.directory,
			RUPEE_MODELS: 'verify',
			RUPEE_MODELS_DIR: resolve('data/models'),
			RUPEE_LOG_LEVEL: 'warn',
			RUPEE_SIGNUP: 'open',
		},
		stdio: ['ignore', 'ignore', 'inherit'],
	});
	await untilUp(url);
	await use({ url, db: openDatabase(database.path) });
	child.kill();
	await database.dispose();
};
