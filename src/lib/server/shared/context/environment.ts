import { resolve } from 'node:path';
import { openDatabase, type DatabaseHandle } from '../../db/index';
import type { RupeeConfiguration } from './config';
import type { RupeeContext } from './context';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { models } from '../onnx/models';
import { createModels } from '../onnx/runtime';
import { localStorage } from '../storage/local';
import { scoped, type Storages } from '../storage/storage';

/** One for every user, so writes to the same file wait for each other. */
const createStorages = (c: RupeeConfiguration): Storages => {
	const data = localStorage(resolve(c.storage.files));
	return { local: (u) => scoped(data, `users/${u}`) };
};

/** Kept across dev reloads, since a second embedded server on the same directory fails to start. */
export const createDatabase = (c: RupeeConfiguration): Promise<DatabaseHandle> => {
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
	config: RupeeConfiguration,
	database: Pick<DatabaseHandle, 'orm' | 'kysely'>,
	dev: boolean,
): RupeeContext => {
	const logger = createLogger(config.log.level, dev);
	return {
		config,
		db: database.orm,
		kysely: database.kysely,
		storages: createStorages(config),
		mailer: logMailer,
		logger,
		models: createModels({
			directory: resolve(config.models.dir),
			files: models,
			threads: config.models.threads,
			mode: config.models.mode,
			logger,
		}),
	};
};
