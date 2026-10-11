import { resolve } from 'node:path';
import { dev } from '$app/env';
import {
	DATABASE_URL,
	RUPEE_DATA_DIR,
	RUPEE_DATE_FORMATS,
	RUPEE_LOG_LEVEL,
	RUPEE_MODELS,
	RUPEE_MODELS_DIR,
	RUPEE_TIME_FORMATS,
	RUPEE_SIGNUP,
	RUPEE_STORAGE,
} from '$app/env/private';
import { openDatabase, type Database, type DatabaseHandle } from '../db';
import { defaultConfiguration } from './config';
import type { RupeeContext } from './context';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { localStorage } from './storage/local';
import type { Storage } from './storage/storage';
import { models } from './onnx/models';
import { createModels } from './onnx/runtime';

const storages = {
	local: () => localStorage(resolve(RUPEE_DATA_DIR)),
} satisfies Record<typeof RUPEE_STORAGE, () => Storage>;

// Kept across dev reloads: two embedded instances on one directory corrupt it.
export const createDatabase = (): DatabaseHandle => {
	const kept: DatabaseHandle | undefined = import.meta.hot?.data.database;
	if (kept) return kept;

	const handle = openDatabase({
		url: DATABASE_URL,
		directory: resolve(RUPEE_DATA_DIR, 'postgres'),
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
		storage: storages[RUPEE_STORAGE](),
		mailer: logMailer,
		logger,
		models: createModels({
			directory: resolve(RUPEE_MODELS_DIR),
			files: models,
			mode: RUPEE_MODELS,
			logger,
		}),
	};
};
