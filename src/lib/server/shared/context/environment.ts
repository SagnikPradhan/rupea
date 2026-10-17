import { dev } from '$app/env';
import {
	DATABASE_URL,
	RUPEE_DATA_DIR,
	RUPEE_DATE_FORMATS,
	RUPEE_LOG_LEVEL,
	RUPEE_MIGRATIONS_DIR,
	RUPEE_MODELS,
	RUPEE_MODELS_DIR,
	RUPEE_MODEL_THREADS,
	RUPEE_SIGNUP,
	RUPEE_TIME_FORMATS,
} from '$app/env/private';
import { resolve } from 'node:path';
import { openDatabase, type Database, type DatabaseHandle } from '../../db/index';
import { defaultConfiguration } from './config';
import type { RupeeContext } from './context';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { models } from '../onnx/models';
import { createModels } from '../onnx/runtime';
import { localStorage } from '../storage/local';
import { scoped, type Storages } from '../storage/storage';

// One for every user, so writes to the same file wait for each other.
const createStorages = (): Storages => {
	const data = localStorage(resolve(RUPEE_DATA_DIR));
	return { local: (u) => scoped(data, `users/${u}`) };
};

// Kept across dev reloads: a second embedded server on the same directory fails to start.
export const createDatabase = (): Promise<DatabaseHandle> => {
	const kept: Promise<DatabaseHandle> | undefined = import.meta.hot?.data.database;
	if (kept) return kept;

	const handle = openDatabase({
		url: DATABASE_URL,
		directory: resolve(RUPEE_DATA_DIR, 'postgres'),
		migrations: resolve(RUPEE_MIGRATIONS_DIR),
	});
	if (import.meta.hot) import.meta.hot.data.database = handle;
	return handle;
};

export const createContext = (db: Database): RupeeContext => {
	const logger = createLogger(RUPEE_LOG_LEVEL, dev);
	return {
		config: {
			dateFormats: RUPEE_DATE_FORMATS,
			timeFormats: RUPEE_TIME_FORMATS,
			signup: RUPEE_SIGNUP,
			prediction: defaultConfiguration.prediction,
		},
		db,
		storages: createStorages(),
		mailer: logMailer,
		logger,
		models: createModels({
			directory: resolve(RUPEE_MODELS_DIR),
			files: models,
			threads: RUPEE_MODEL_THREADS,
			mode: RUPEE_MODELS,
			logger,
		}),
	};
};
