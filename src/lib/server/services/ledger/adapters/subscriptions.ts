import { inOrder, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Subscription } from '#services/events/application/events.ts';
import { enqueue } from '#services/jobs/application/jobs.ts';
import { filesChanged } from '#services/storage/application/changes.ts';
import { handleOf } from '../application/ledger';
import { syncLedger } from './jobs';

/** Queues a sync of each ledger whose files may have changed. */
export const syncChanged: Subscription<{ keys: string[] }> = {
	event: filesChanged,
	run: (e, user) => {
		const handles = new Set(e.keys.map(handleOf).filter((h) => h !== null));
		return inOrder([...handles].map((h) => () => queueSync(user, h))).map(() => undefined);
	},
};

const queueSync = (u: string, h: string): ResultAsync<void> =>
	enqueue({ job: syncLedger, user: u, payload: { ledger: h } });
