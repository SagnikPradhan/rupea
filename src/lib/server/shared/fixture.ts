/**
 * A Vitest `it` whose tests get a whole runtime context: fresh local storage
 * (see `storage/fixture.ts`) and a real SQLite database, migrated once per
 * test file, and the table models in `data/models`, if the server has
 * downloaded them; tests never download them.
 * Run the code under test inside `provide(context, ...)`.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { openDatabase, type Database } from '../db';
import { defaultConfiguration } from './config';
import type { RupeeContext } from './context';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { it as base } from './storage/fixture';
import { models } from './onnx/models';
import { createModels } from './onnx/runtime';

const migrate = (p: string) =>
	promisify(execFile)('node_modules/.bin/prisma', ['db', 'migrate'], {
		env: { ...process.env, DATABASE_PATH: p },
	});

export const it = base.extend<{ db: Database; context: RupeeContext }>({
	db: [
		// Vitest reads the fixtures a test uses from this destructuring.
		async ({}, use) => {
			const directory = await mkdtemp(join(tmpdir(), 'rupee-db-'));
			const path = join(directory, 'rupee.db');
			await migrate(path);
			await use(openDatabase(path));
			await rm(directory, { recursive: true, force: true });
		},
		{ scope: 'file' },
	],
	context: async ({ db, storage }, use) => {
		const logger = createLogger('silent', false);
		await use({
			config: defaultConfiguration,
			db,
			storage,
			mailer: logMailer,
			logger,
			models: createModels({
				directory: resolve('data/models'),
				files: models,
				mode: 'verify',
				logger,
			}),
		});
	},
});
