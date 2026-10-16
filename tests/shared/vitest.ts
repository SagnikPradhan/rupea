import type { Database } from '#lib/server/db/index.ts';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import type { RupeeContext } from '#lib/server/shared/context.ts';
import { createLogger } from '#lib/server/shared/logger.ts';
import { logMailer } from '#lib/server/shared/mailer.ts';
import { models as files } from '#lib/server/shared/onnx/models.ts';
import { createModels, type Models } from '#lib/server/shared/onnx/runtime.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';
import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it as base } from 'vitest';
import { createTemporaryDatabase } from './database.ts';

export const it = base.extend<{
	root: string;
	storage: Storage;
	db: Database;
	models: Models;
	context: RupeeContext;
}>({
	root: async ({}, use) => {
		const root = await mkdtemp(join(tmpdir(), 'rupee-'));
		await use(root);
		await rm(root, { recursive: true, force: true });
	},
	storage: ({ root }, use) => use(localStorage(root)),
	db: [
		// Vitest reads the fixtures a test uses from this destructuring.
		async ({}, use) => {
			const handle = await createTemporaryDatabase();
			await use(handle.orm);
			await handle.close();
		},
		{ scope: 'file' },
	],
	// Loading the models takes about a second, so every test in a worker shares them.
	models: [
		({}, use) =>
			use(
				createModels({
					directory: resolve('data/models'),
					files,
					threads: 3,
					mode: 'verify',
					logger: createLogger('silent', false),
				}),
			),
		{ scope: 'worker' },
	],
	context: async ({ db, storage, models }, use) => {
		const logger = createLogger('silent', false);
		await use({
			config: defaultConfiguration,
			db,
			storages: { local: (u) => scoped(storage, `users/${u}`) },
			mailer: logMailer,
			logger,
			models,
		});
	},
});
