import type { Database } from '#lib/server/db/index.ts';
import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import type { RupeaContext } from '#lib/server/shared/context/context.ts';
import { createLogger } from '#lib/server/shared/context/logger.ts';
import { logMailer } from '#lib/server/shared/context/mailer.ts';
import type { Models } from '#lib/server/shared/onnx/runtime.ts';
import { byUser, type Storage } from '#lib/server/shared/storage/storage.ts';

export const createTestContext = (
	db: Database,
	storage: Storage,
	models: Models,
): RupeaContext => ({
	config: defaultConfiguration,
	db,
	storages: { local: byUser(storage) },
	subscriptions: [],
	mailer: logMailer,
	logger: createLogger('silent', false),
	models,
	fetch: () => Promise.reject(new Error('Tests do not reach the internet')),
});
