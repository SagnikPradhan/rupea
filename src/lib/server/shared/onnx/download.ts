import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fault, unknownError } from '../result/error';
import { attempt, attemptWith, errAsync, okAsync, type ResultAsync } from '../result/result';
import type { Logger } from '../logger';

export type ModelFile = { file: string; url: string; sha256: string };

export type ModelMode = 'download' | 'verify';

export type ModelOptions = {
	mode: ModelMode;
	logger: Logger;
	fetch: typeof globalThis.fetch;
};

const PROGRESS = 15_000;

export const prepare = (directory: string): ResultAsync<void> =>
	attempt(() => mkdir(directory, { recursive: true }))
		.andThen(() => attempt(() => readdir(directory)))
		.andThen((names) =>
			attempt(() =>
				Promise.all(
					names
						.filter((n) => n.endsWith('.part'))
						.map((n) => rm(join(directory, n), { force: true })),
				),
			),
		)
		.map(() => undefined);

type EnsureOptions = ModelOptions & {
	directory: string;
	model: ModelFile;
};

export const ensure = (options: EnsureOptions): ResultAsync<string> => {
	const { directory, model, mode, logger, fetch } = options;
	const path = join(directory, model.file);

	return check(path, model.sha256)
		.orElse((error) => {
			if (mode === 'verify') return errAsync(error);
			return download({ path, model, logger, fetch });
		})
		.map(() => path)
		.mapErr((error) => {
			logger.error({ file: model.file, error }, 'model unavailable');
			return fault('ExtractionMissingModel', { path, cause: [error] });
		});
};

const check = (path: string, expected: string): ResultAsync<void> =>
	attemptWith({
		try: () => digest(path),
		catch: (thrown) =>
			fault('CannotReadFile', {
				path,
				reason: 'failed to read model',
				cause: [unknownError(thrown)],
			}),
	}).andThen((actual) => {
		if (actual === expected) return okAsync(undefined);
		return errAsync(fault('ModelHashMismatch', { path, expected, actual }));
	});

const digest = async (path: string) => {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
};

type DownloadOptions = {
	path: string;
	model: ModelFile;
	logger: Logger;
	fetch: typeof globalThis.fetch;
};

// Written and checked under its own name first, so an interrupted, bad or
// concurrent download never leaves a bad model.
const download = (options: DownloadOptions): ResultAsync<void> => {
	const { path, model, logger, fetch } = options;
	const { file, url, sha256 } = model;

	const part = `${path}.${randomUUID()}.part`;
	const started = performance.now();
	const log = logger.child({ file });
	const failed = (t: unknown) => fault('ModelDownloadFailed', { url, cause: [unknownError(t)] });

	log.info({ url }, 'model downloading');
	return attemptWith({ try: () => fetch(url), catch: failed })
		.andThen((response) => {
			if (!response.ok || !response.body)
				return errAsync(fault('ModelDownloadFailed', { url, status: response.status }));
			return attemptWith({
				try: () => save({ response, part, logger: log }),
				catch: failed,
			});
		})
		.andThen((b) => check(part, sha256).map(() => b))
		.andThen((b) => attempt(() => rename(part, path)).map(() => b))
		.map((n) =>
			log.info({ bytes: n, ms: Math.round(performance.now() - started) }, 'model downloaded'),
		)
		.orElse((e) => attempt(() => rm(part, { force: true })).andThen(() => errAsync(e)));
};

type SaveOptions = {
	response: Response;
	part: string;
	logger: Logger;
};

const save = async (options: SaveOptions) => {
	const { response, part, logger } = options;
	const total = Number(response.headers.get('content-length')) || null;
	const seen = { bytes: 0, logged: performance.now() };

	async function* track(chunks: AsyncIterable<Buffer>) {
		for await (const chunk of chunks) {
			seen.bytes += chunk.length;
			if (performance.now() - seen.logged >= PROGRESS) {
				seen.logged = performance.now();
				const bytes = seen.bytes;
				const percent = total ? Math.floor((bytes / total) * 100) : undefined;
				logger.info({ bytes, percent }, 'model download progress');
			}
			yield chunk;
		}
	}

	await pipeline(
		// `download` checked there is a body; the DOM and Node typings of it differ.
		Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
		track,
		createWriteStream(part),
	);
	return seen.bytes;
};
