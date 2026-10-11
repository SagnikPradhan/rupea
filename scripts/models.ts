import { createLogger } from '#lib/server/shared/logger.ts';
import { ensure, prepare, type ModelFile } from '#lib/server/shared/onnx/download.ts';
import { models } from '#lib/server/shared/onnx/models.ts';
import { batchAsync, okAsync } from '#lib/server/shared/result.ts';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as v from 'valibot';
import { variables } from '../src/env.ts';

const flags = parseArgs({ options: { verify: { type: 'boolean', default: false } } }).values;
const mode = flags.verify ? 'verify' : 'download';
const directory = resolve(
	v.parse(variables.RUPEE_MODELS_DIR.schema, process.env['RUPEE_MODELS_DIR']),
);
const level = v.parse(variables.RUPEE_LOG_LEVEL.schema, process.env['RUPEE_LOG_LEVEL']);
const logger = createLogger(level, process.stdout.isTTY);

const prepared = mode === 'download' ? prepare(directory) : okAsync<void>(undefined);
const ready = (m: ModelFile) => ensure({ directory, model: m, mode, logger, fetch });

const result = await prepared.andThen(() => batchAsync(models.map(ready)));

if (result.isErr())
	logger.error({ directory, error: result.error }, 'models directory not readied');
if (result.isErr() || result.value.failed.length > 0) process.exitCode = 1;
if (result.isOk() && result.value.failed.length === 0) logger.info({ directory }, 'models ready');
