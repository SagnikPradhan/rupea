/**
 * Keeps model files in a directory at their pinned revisions. A file is intact
 * when its SHA-256 matches; one that is missing or not intact is downloaded,
 * in `download` mode, or reported missing, in `verify` mode. Files and
 * downloads are streamed through the hash, so memory stays flat however large
 * a model is.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { unknownError, type RupeeError } from '../error';
import type { Logger } from '../logger';
import { attempt, errAsync, okAsync, type ResultAsync } from '../result';

/** A model file, where it is downloaded from, and the SHA-256 it must have. */
export type ModelFile = { file: string; url: string; sha256: string };

/** `download` fetches what is missing or not intact; `verify` never connects out. */
export type ModelMode = 'download' | 'verify';

export type ModelOptions = {
	mode: ModelMode;
	logger: Logger;
	fetch: typeof globalThis.fetch;
};

/** How often a download in progress is logged, in milliseconds. */
const PROGRESS = 15_000;

/**
 * Readies `directory` for downloads: makes it, and removes the `.part` files
 * interrupted downloads leave.
 */
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

/** The path of `model` in `directory`, once it is there and intact. */
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
		.mapErr((error): RupeeError => {
			logger.error({ file: model.file, error }, 'model unavailable');
			return { type: 'ExtractionMissingModel', path, cause: [error] };
		});
};

/** Fails unless the file at `path` is there with SHA-256 `expected`. */
const check = (path: string, expected: string): ResultAsync<void> =>
	attempt({
		try: () => digest(path),
		catch: (thrown): RupeeError => ({
			type: 'CannotReadFile',
			path,
			reason: 'failed to read model',
			cause: [unknownError(thrown)],
		}),
	}).andThen((actual) => {
		if (actual === expected) return okAsync(undefined);
		return errAsync<void, RupeeError>({
			type: 'ModelHashMismatch',
			path,
			expected,
			actual,
			cause: [],
		});
	});

const digest = async (path: string) => {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
};

/**
 * Downloads `model` to `path`. It is written aside first, under a name of its
 * own, and checked there, so neither an interrupted download, a bad one, nor
 * another one of the same file leaves a bad model.
 */
type DownloadOptions = {
	path: string;
	model: ModelFile;
	logger: Logger;
	fetch: typeof globalThis.fetch;
};

const download = (options: DownloadOptions): ResultAsync<void> => {
	const { path, model, logger, fetch } = options;
	const { file, url, sha256 } = model;
	const part = `${path}.${randomUUID()}.part`;
	const started = performance.now();
	const log = logger.child({ file });
	const failed = (thrown: unknown): RupeeError => ({
		type: 'ModelDownloadFailed',
		url,
		cause: [unknownError(thrown)],
	});
	log.info({ url }, 'model downloading');
	return attempt({ try: () => fetch(url), catch: failed })
		.andThen((response) => {
			if (!response.ok || !response.body)
				return errAsync<never, RupeeError>({
					type: 'ModelDownloadFailed',
					url,
					status: response.status,
					cause: [],
				});
			return attempt({
				try: () => save({ response, part, logger: log }),
				catch: failed,
			});
		})
		.andThen((b) => check(part, sha256).map(() => b))
		.andThen((b) => attempt(() => rename(part, path)).map(() => b))
		.map((n) =>
			log.info({ bytes: n, ms: Math.round(performance.now() - started) }, 'model downloaded'),
		)
		.orElse((err) => attempt(() => rm(part, { force: true })).andThen(() => errAsync(err)));
};

type SaveOptions = {
	response: Response;
	part: string;
	logger: Logger;
};

/**
 * Streams the body of `response` into `part`, logging its progress every so
 * often; how many bytes it was.
 */
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
