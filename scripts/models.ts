import { readConfiguration } from '#lib/server/shared/context/config.ts';
import { createLogger } from '#lib/server/shared/context/logger.ts';
import { ensure, prepare, type ModelFile } from '#lib/server/shared/onnx/download.ts';
import { models } from '#lib/server/shared/onnx/models.ts';
import { batchAsync } from '#lib/server/shared/result/batch.ts';
import { okAsync } from '#lib/server/shared/result/result.ts';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const flags = parseArgs({ options: { verify: { type: 'boolean', default: false } } }).values;
const config = readConfiguration(process.env);

const mode = flags.verify ? 'verify' : 'download';
const directory = resolve(config.models.dir);
const logger = createLogger(config.log.level, process.stdout.isTTY);

const prepared = mode === 'download' ? prepare(directory) : okAsync<void>(undefined);
const ready = (m: ModelFile) => ensure({ directory, model: m, mode, logger, fetch });

const result = await prepared.andThen(() => batchAsync(models.map(ready)));

if (result.isErr())
	logger.error({ directory, error: result.error }, 'models directory not readied');
if (result.isErr() || result.value.failed.length > 0) process.exitCode = 1;
if (result.isOk() && result.value.failed.length === 0) logger.info({ directory }, 'models ready');
