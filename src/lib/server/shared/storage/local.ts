import { watch, type BigIntStats, type Dirent } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { on } from 'node:events';
import { glob, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fault, type RupeaError, unknownError } from '../result/error';
import { attempt, err, ok, okAsync, type Result, ResultAsync, inOrder } from '../result/result';
import { validateKey, type Entry, type Storage } from './storage';

// Writes land here and are renamed into place, so a crash never leaves half a file.
const TEMPORARY = '.tmp';

const isMissing = (t: unknown) => t instanceof Error && 'code' in t && t.code === 'ENOENT';

const filesystem = <T>(k: string, f: () => Promise<T>): ResultAsync<T> =>
	attempt(f, (e) => (isMissing(e) ? fault('StorageNotFound', { key: k }) : unknownError(e)));

const whenMissing =
	<T>(fb: T) =>
	(e: RupeaError): Result<T> =>
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

	const described = (k: string): ResultAsync<Entry> =>
		filesystem(k, () => stat(path(k), { bigint: true })).map((s) => entryOf(k, s));

	const read: Storage['read'] = (k) =>
		validateKey(k).asyncAndThen(() =>
			filesystem(k, () => Promise.all([stat(path(k), { bigint: true }), readFile(path(k))])).map(
				([stats, content]) => ({ entry: entryOf(k, stats), content }),
			),
		);

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
			.andThen((ks) =>
				inOrder(ks.map((k) => () => described(k).orElse(whenMissing(null)))).map((e) =>
					e.filter((f) => f !== null),
				),
			);
	};

	const expectVersion = (key: string, expected: string | null): ResultAsync<void> =>
		described(key)
			.map((e) => e.version)
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

						return entryOf(key, await stat(path(key), { bigint: true }));
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

	const watch_: Storage['watch'] = async function* (signal) {
		await mkdir(root, { recursive: true });

		// Aborting closes the watcher, and 'close' ends the loop instead of throwing.
		const changes = on(watch(root, { recursive: true, signal }), 'change', { close: ['close'] });
		for await (const [, name] of changes)
			if (typeof name === 'string' && name.split(sep)[0] !== TEMPORARY)
				yield name.split(sep).join('/');
	};

	return { list, read, write, delete: delete_, rename: rename_, watch: watch_ };
};

/** Versions by nanosecond mtime and size, so telling a change apart reads no content. */
const entryOf = (key: string, stats: BigIntStats): Entry => ({
	key,
	size: Number(stats.size),
	modified: stats.mtime,
	version: `${stats.mtimeNs}-${stats.size}`,
});
