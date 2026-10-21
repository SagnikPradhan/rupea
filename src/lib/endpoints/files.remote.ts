import { ok, type Result, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { format } from '#services/ledger/application/shared.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, Key } from './shared';
import { getIssues } from './transactions.remote';

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
): Promise<Result<T>> => {
	const result = await inLedger({ handle, action: run });
	void getFiles(handle).refresh();
	void getIssues(handle).refresh();
	return result;
};

export const createFile = command(
	v.object({ handle: Handle, key: Key, content: v.string() }),
	async ({ handle, key, content }) =>
		replyFrom(await mutate(handle, (l) => Files.createFile({ ledger: l, key, content }))),
);

export const editFile = command(
	v.object({ handle: Handle, key: Key, content: v.string(), version: v.string() }),
	async ({ handle, key, content, version }) =>
		replyFrom(await mutate(handle, (l) => Files.editFile({ ledger: l, key, content, version }))),
);

export const renameFiles = command(
	v.object({ handle: Handle, moves: v.array(v.object({ from: Key, to: Key })) }),
	async ({ handle, moves }) =>
		replyFromBatch(await mutate(handle, (l) => Files.renameFiles(l, moves))),
);

export const deleteFiles = command(
	v.object({ handle: Handle, keys: v.array(Key) }),
	async ({ handle, keys }) =>
		replyFromBatch(await mutate(handle, (l) => Files.deleteFiles(l, keys))),
);
