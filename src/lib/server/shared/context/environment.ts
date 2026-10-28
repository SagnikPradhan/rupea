import { resolve } from 'node:path';
import { openDatabase, type Database, type DatabaseHandle } from '../../db/index';
import type { RupeaConfiguration } from './config';
import type { RupeaContext } from './context';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { models } from '../onnx/models';
import { createModels } from '../onnx/runtime';
import { localStorage } from '../storage/local';
import { scoped, type Change, type Storage, type Storages } from '../storage/storage';

/** Each user's storage within one holding every user's, so writes to the same file wait for each other. */
const createStorages = (d: Storage): Storages => ({ local: (u) => scoped(d, `users/${u}`) });

/** Each user's changed keys, in a storage laid out as createStorages lays it out. */
export async function* watchUsers(data: Storage, signal: AbortSignal): AsyncIterable<Change> {
	for await (const key of data.watch(signal)) {
		const [top, user, ...rest] = key.split('/');
		if (top === 'users' && user && rest.length > 0) yield { user, key: rest.join('/') };
	}
}

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
): RupeaContext => {
	const logger = createLogger(config.log.level, dev);
	const data = localStorage(resolve(config.storage.files));
	return {
		config,
		db,
		storages: createStorages(data),
		changes: (s) => watchUsers(data, s),
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
