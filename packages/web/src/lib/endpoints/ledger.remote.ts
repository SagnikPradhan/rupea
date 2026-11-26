import * as v from 'valibot';
import { Handle } from '@rupea/shared/text.ts';
import { command, query } from '$app/server';
import { api } from './api';
import { replyFromBatchCall, replyFromCall } from './reply';

export const findFirstDay = query(Handle, (h) =>
	replyFromCall(api().ledger.findFirstDay({ handle: h })),
);

/** What is wrong across the ledger, as its last sync left it. */
export const listProblems = query(Handle, (h) =>
	replyFromBatchCall(api().ledger.listProblems({ handle: h })),
);

export const findSync = query(Handle, (h) => replyFromCall(api().ledger.findSync({ handle: h })));

export const resync = command(Handle, async (h) => {
	const queued = await replyFromCall(api().ledger.resync({ handle: h }));
	void findSync(h).refresh();
	return queued;
});

/** The currencies the ledger's prices can value it in, its base among them. */
export const listCurrencies = query(Handle, (h) =>
	replyFromCall(api().ledger.listCurrencies({ handle: h })),
);

/**
 * Sets the currency a bare amount is in, which relabels amounts and converts
 * none.
 */
export const saveBase = command(
	v.object({ handle: Handle, base: v.string() }),
	async ({ handle, base }) => {
		const saved = await replyFromCall(api().ledger.saveBase({ handle, base }));
		void listProblems(handle).refresh();
		return saved;
	},
);
