import { Handle } from '@rupea/shared/handle.ts';
import { command, query } from '$app/server';
import { api } from './api';
import { replyFromBatchCall, replyFromCall } from './reply';

export const findFirstDay = query(Handle, (h) => replyFromCall(api().findFirstDay({ handle: h })));

/** What is wrong across the ledger, as its last sync left it. */
export const listProblems = query(Handle, (h) =>
	replyFromBatchCall(api().listProblems({ handle: h })),
);

export const findSync = query(Handle, (h) => replyFromCall(api().findSync({ handle: h })));

export const resync = command(Handle, async (h) => {
	const queued = await replyFromCall(api().resync({ handle: h }));
	void findSync(h).refresh();
	return queued;
});
