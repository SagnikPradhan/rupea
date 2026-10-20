import { ok, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { type Reply, replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { format } from '#services/ledger/application/shared.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, Key } from './shared';
import { getTransactions } from './transactions.remote';

export const getFiles = query(Handle, async (h) =>
	replyFromBatch(await inLedger({ handle: h, action: Files.listFiles })),
);

/** A command, not a query: never cached, as the file may change behind the app's back. */
export const readFile = command(v.object({ handle: Handle, key: Key }), async ({ handle, key }) =>
	replyFrom(await inLedger({ handle, action: (l) => Files.getFile(l, key) })),
);

/** Tidies a draft's whitespace without saving it. */
export const formatDraft = command(v.object({ content: v.string() }), async ({ content }) =>
	replyFrom(await Auth.withCurrentUser(() => ok(format(content)))),
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
		mutate(handle, (l) => Files.createFile({ ledger: l, key, content })),
);

export const editFile = command(
	v.object({ handle: Handle, key: Key, content: v.string(), version: v.string() }),
	({ handle, key, content, version }) =>
		mutate(handle, (l) => Files.editFile({ ledger: l, key, content, version })),
);

export const renameFile = command(
	v.object({ handle: Handle, key: Key, to: Key }),
	({ handle, key, to }) => mutate(handle, (l) => Files.renameFile({ ledger: l, from: key, to })),
);

export const deleteFile = command(v.object({ handle: Handle, key: Key }), ({ handle, key }) =>
	mutate(handle, (l) => Files.deleteFile(l, key)),
);
