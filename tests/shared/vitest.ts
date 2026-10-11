import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, it as base } from 'vitest';
import type { Database } from '#lib/server/db/index.ts';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import type { RupeeContext } from '#lib/server/shared/context.ts';
import { createLogger } from '#lib/server/shared/logger.ts';
import { logMailer } from '#lib/server/shared/mailer.ts';
import { createTemporaryDatabase, template } from './database.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';
import type { Storage } from '#lib/server/shared/storage/storage.ts';
import { models } from '#lib/server/shared/onnx/models.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';

// Starting Postgres compiles it first, slower than a test may take.
beforeAll(() => template.then(() => undefined));

export const it = base.extend<{
	root: string;
	storage: Storage;
	db: Database;
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
