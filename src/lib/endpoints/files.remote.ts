import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import { type Reply, replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, Key } from './shared';
import { getTransactions } from './transactions.remote';

export const getFiles = query(Handle, async (h) =>
	replyFromBatch(await inLedger({ handle: h, action: Ledger.listFiles })),
);

/** A command, not a query: never cached, as the file may change behind the app's back. */
export const readFile = command(v.object({ handle: Handle, key: Key }), async ({ handle, key }) =>
	replyFrom(await inLedger({ handle, action: (l) => Ledger.getFile(l, key) })),
);

const mutate = async <T>(
	handle: string,
	run: (ledger: Ledger.Ledger) => ResultAsync<T>,
): Promise<Reply<T>> => {
	const result = await inLedger({ handle, action: run });
	void getFiles(handle).refresh();
	void getTransactions(handle).refresh();
	return replyFrom(result);
};

export const createFile = command(
	v.object({ handle: Handle, key: Key, content: v.string() }),
	({ handle, key, content }) =>
		mutate(handle, (l) => Ledger.createFile({ ledger: l, key, content })),
);

export const editFile = command(
	v.object({ handle: Handle, key: Key, content: v.string(), version: v.string() }),
	({ handle, key, content, version }) =>
		mutate(handle, (l) => Ledger.editFile({ ledger: l, key, content, version })),
);

export const renameFile = command(
	v.object({ handle: Handle, key: Key, to: Key }),
	({ handle, key, to }) => mutate(handle, (l) => Ledger.renameFile({ ledger: l, from: key, to })),
);

export const deleteFile = command(v.object({ handle: Handle, key: Key }), ({ handle, key }) =>
	mutate(handle, (l) => Ledger.deleteFile(l, key)),
);
