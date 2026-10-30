import type { Database, DatabaseHandle } from '#lib/server/db/index.ts';
import type { RupeaContext } from '#lib/server/shared/context/context.ts';
import { createLogger } from '#lib/server/shared/context/logger.ts';
import { models as files } from '#lib/server/shared/onnx/models.ts';
import { createModels, type Models } from '#lib/server/shared/onnx/runtime.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';
import type { Storage } from '#lib/server/shared/storage/storage.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it as base } from 'vitest';
import { createTestContext } from './context.ts';
import { createTemporaryDatabase } from './database.ts';

export const it = base.extend<{
	root: string;
	storage: Storage;
	handle: DatabaseHandle;
	db: Database;
	models: Models;
	context: RupeaContext;
}>({
	root: async ({}, use) => {
		const root = await mkdtemp(join(tmpdir(), 'rupea-'));
		await use(root);
		await rm(root, { recursive: true, force: true });
	},
	storage: ({ root }, use) => use(localStorage(root)),
	handle: [
		// Vitest reads the fixtures a test uses from this destructuring.
		async ({}, use) => {
			const handle = await createTemporaryDatabase();
			await use(handle);
			await handle.close();
		},
		{ scope: 'file' },
	],
	db: ({ handle }, use) => use(handle.db),
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
	context: ({ db, storage, models }, use) => use(createTestContext(db, storage, models)),
});
