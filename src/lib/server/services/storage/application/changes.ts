import { withContext } from '#lib/server/shared/context/context.ts';
import type { Logger } from '#lib/server/shared/context/logger.ts';
import { inWindows } from '#lib/server/shared/iterables.ts';
import type { Change } from '#lib/server/shared/storage/storage.ts';
import { publish, type Event } from '#services/events/application/events.ts';
import * as v from 'valibot';

/** One write raises several changes, and a checkout raises one for each file it touches. */
const WINDOW = 250;

const FilesChanged = v.object({ keys: v.array(v.string()) });

/** Keys in a user's storage may have changed, by Rupea or anyone else. */
export const filesChanged: Event<v.InferOutput<typeof FilesChanged>> = {
	name: 'files-changed',
	payload: FilesChanged,
};

/** Publishes `files-changed` for each user whose storage changed, at most once a window, until the signal aborts. */
export const publishChanges = (s: AbortSignal): Promise<void> =>
	withContext(
		'storages',
		'logger',
	)(async ({ storages, logger }) => {
		await Promise.all(Object.values(storages).map((u) => publishAll(u.watch(s), logger)));
	});

const publishAll = async (changes: AsyncIterable<Change>, logger: Logger) => {
	for await (const window of inWindows(changes, WINDOW))
		await Promise.all(
			Object.entries(keysByUser(window)).map(([user, keys]) => publishFor(user, keys, logger)),
		);
};

const publishFor = async (user: string, keys: string[], logger: Logger) => {
	const failed = await publish({ event: filesChanged, user, payload: { keys } }).match(
		(f) => f,
		(e) => [e],
	);
	for (const e of failed) logger.warn({ error: e, user, keys: keys.length }, 'change not handled');
};

const keysByUser = (changes: Change[]): Record<string, string[]> =>
	Object.fromEntries(
		Object.entries(Object.groupBy(changes, (c) => c.user)).map(([user, mine = []]) => [
			user,
			[...new Set(mine.map((c) => c.key))],
		]),
	);
