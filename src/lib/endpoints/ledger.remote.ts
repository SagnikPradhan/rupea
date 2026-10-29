import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { command, query } from '$app/server';
import { Handle, inLedger } from './shared';

export const findFirstDay = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Ledger.findFirstDay }).map((d) => d?.toString() ?? null)),
);

/** What is wrong across the ledger, as its last sync left it. */
export const listProblems = query(Handle, (h) =>
	replyFromBatch(inLedger({ handle: h, action: Sync.listProblems })),
);

export const findSync = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Sync.findSync })),
);

export const sync = command(Handle, async (h) => {
	const queued = await inLedger({ handle: h, action: Sync.sync });
	void findSync(h).refresh();
	return replyFrom(queued);
});
