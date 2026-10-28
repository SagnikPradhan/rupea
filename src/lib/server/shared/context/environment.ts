import { resolve } from 'node:path';
import { openDatabase, type Database, type DatabaseHandle } from '../../db/index';
import type { RupeaConfiguration } from './config';
import type { RupeaContext } from './context';
import type { Subscription } from '#services/events/application/events.ts';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { models } from '../onnx/models';
import { createModels } from '../onnx/runtime';
import { localStorage } from '../storage/local';
import { byUser, type Storages } from '../storage/storage';

/** One for every user, so writes to the same file wait for each other. */
const createStorages = (c: RupeaConfiguration): Storages => ({
	local: byUser(localStorage(resolve(c.storage.files))),
});

/** Kept across dev reloads, since a second embedded server on the same directory fails to start. */
export const createDatabase = (c: RupeaConfiguration): Promise<DatabaseHandle> => {
	const kept: Promise<DatabaseHandle> | undefined = import.meta.hot?.data.database;
	if (kept) return kept;

	const handle = openDatabase({
		url: c.storage.database,
		directory: resolve(c.storage.files, 'postgres'),
	});
	if (import.meta.hot) import.meta.hot.data.database = handle;
	return handle;
};

export const createContext = (
	config: RupeaConfiguration,
	db: Database,
	dev: boolean,
	subscriptions: Subscription<unknown>[],
): RupeaContext => {
	const logger = createLogger(config.log.level, dev);
	return {
		config,
		db,
		storages: createStorages(config),
		subscriptions,
		mailer: logMailer,
		logger,
		models: createModels({
			directory: resolve(config.models.dir),
			files: models,
			threads: config.models.threads,
			mode: config.models.mode,
			logger,
		}),
		fetch: globalThis.fetch,
	};
};
