/**
 * Builds the runtime context from the environment. The only place that reads
 * `$app/env/private` for server configuration; called once, by
 * `hooks.server.ts`.
 */
import { resolve } from 'node:path';
import { dev } from '$app/env';
import {
	DATABASE_PATH,
	RUPEE_DATA_DIR,
	RUPEE_DATE_FORMATS,
	RUPEE_LOG_LEVEL,
	RUPEE_MODELS,
	RUPEE_MODELS_DIR,
	RUPEE_TIME_FORMATS,
	RUPEE_SIGNUP,
	RUPEE_STORAGE,
} from '$app/env/private';
import { openDatabase } from '../db';
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

export const createContext = (): RupeeContext => {
	const logger = createLogger(RUPEE_LOG_LEVEL, dev);
	return {
		config: {
			dateFormats: RUPEE_DATE_FORMATS,
			timeFormats: RUPEE_TIME_FORMATS,
			signup: RUPEE_SIGNUP,
		},
		db: openDatabase(DATABASE_PATH),
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
