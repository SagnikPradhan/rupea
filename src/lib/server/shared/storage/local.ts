import type { Dirent } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { glob, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fault, type RupeeError, unknownError } from '../result/error';
import {
	attempt,
	attemptWith,
	err,
	ok,
	okAsync,
	type Result,
	ResultAsync,
	sequence,
} from '../result/result';
import { validateKey, type Entry, type Storage } from './storage';

// Writes land here and are renamed into place, so a crash never leaves half a file.
const TEMPORARY = '.tmp';

const hash = (c: Uint8Array) => createHash('sha256').update(c).digest('hex');

const isMissing = (t: unknown) => t instanceof Error && 'code' in t && t.code === 'ENOENT';

const filesystem = <T>(key: string, run: () => Promise<T>): ResultAsync<T> =>
	attemptWith({
		try: run,
		catch: (e) => (isMissing(e) ? fault('StorageNotFound', { key }) : unknownError(e)),
	});

const whenMissing =
	<T>(fb: T) =>
	(e: RupeeError): Result<T> =>
		e.type === 'StorageNotFound' ? ok(fb) : err(e);

export const localStorage = (root: string): Storage => {
	const locks = new Map<string, Promise<unknown>>();

	const exclusive = <T>(keys: string[], effect: () => ResultAsync<T>): ResultAsync<T> => {
		const previous = Promise.allSettled(keys.map((k) => locks.get(k)));
		const current = previous.then(effect);
		for (const key of keys) locks.set(key, current);
		void current.finally(() => {
			for (const key of keys) if (locks.get(key) === current) locks.delete(key);
		});
		return new ResultAsync(current);
	};

	const path = (k: string) => join(root, ...k.split('/'));

	const current = (key: string): ResultAsync<{ entry: Entry; content: Uint8Array }> =>
		filesystem(key, () => Promise.all([stat(path(key)), readFile(path(key))])).map(
			([stats, content]) => ({
				entry: {
					key,
					size: stats.size,
					modified: stats.mtime,
					version: hash(content),
				},
				content,
			}),
		);

	const read: Storage['read'] = (k) => validateKey(k).asyncAndThen(() => current(k));

	const list: Storage['list'] = (prefix = '') => {
		const directory = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
		const keyOf = (d: Dirent) => relative(root, join(d.parentPath, d.name)).split(sep).join('/');
		return filesystem(directory, () =>
			Array.fromAsync(glob('**/*', { cwd: path(directory), withFileTypes: true })),
		)
			.orElse(whenMissing([]))
			.map((dirents) =>
				dirents
					.filter((d) => d.isFile())
					.map(keyOf)
					.filter((k) => k.startsWith(prefix) && !k.startsWith(`${TEMPORARY}/`)),
			)
			.andThen((keys) =>
				sequence(
					keys.map(
						(key) => () =>
							current(key)
								.map((s) => [s.entry])
								.orElse(whenMissing([])),
					),
				),
			);
	};

	const expectVersion = (key: string, expected: string | null): ResultAsync<void> =>
		current(key)
			.map((s) => s.entry.version)
			.orElse(whenMissing(null))
			.andThen((a) =>
				a === expected ? ok() : err(fault('StorageConflict', { key, expected, actual: a })),
			);

	const write: Storage['write'] = ({ key, content, ifVersion }) =>
		validateKey(key).asyncAndThen(() =>
			exclusive([key], () => {
				const temporary = join(root, TEMPORARY, randomUUID());
				return (ifVersion === undefined ? okAsync() : expectVersion(key, ifVersion)).andThen(() =>
					attempt(async () => {
						await mkdir(dirname(temporary), { recursive: true });
						await writeFile(temporary, content);
						await mkdir(dirname(path(key)), { recursive: true });
						await rename(temporary, path(key));
						const stats = await stat(path(key));
						return {
							key,
							size: stats.size,
							modified: stats.mtime,
							version: hash(content),
						};
					}).orTee(() => rm(temporary, { force: true })),
				);
			}),
		);

	const delete_: Storage['delete'] = (k) =>
		validateKey(k).asyncAndThen(() =>
			exclusive([k], () => attempt(() => rm(path(k), { force: true }))),
		);

	const rename_: Storage['rename'] = (from, to) =>
		validateKey(from)
			.andThen(() => validateKey(to))
			.asyncAndThen(() =>
				exclusive([from, to], () =>
					expectVersion(to, null)
						.andThen(() => attempt(() => mkdir(dirname(path(to)), { recursive: true })))
						.andThen(() => filesystem(from, () => rename(path(from), path(to))))
						.andThen(() => read(to))
						.map((s) => s.entry),
				),
			);

	return { list, read, write, delete: delete_, rename: rename_ };
};
