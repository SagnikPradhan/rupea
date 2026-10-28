import { withContext } from '#lib/server/shared/context/context.ts';
import { enqueue } from '#services/jobs/application/jobs.ts';
import { syncLedger } from '../adapters/jobs';

/** Queues a sync of each ledger whose files may have changed, until the signal aborts. */
export const followChanges = (signal: AbortSignal): Promise<void> =>
	withContext(
		'changes',
		'logger',
	)(async ({ changes, logger }) => {
		for await (const c of changes(signal)) {
			const handle = ledgerOf(c.key);
			if (handle)
				await enqueue({ job: syncLedger, user: c.user, payload: { ledger: handle } }).orTee((e) =>
					logger.warn({ error: e, ledger: handle }, 'sync not queued'),
				);
		}
	});

/** A folder's own key counts too, since moving a folder reports only the folder. */
const ledgerOf = (key: string): string | null => {
	const [top, handle, folder] = key.split('/');
	return top === 'ledgers' && handle && folder === 'files' ? handle : null;
};
