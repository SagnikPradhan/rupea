/**
 * Inbound adapter for the ledger: remote functions over the use-cases, run
 * against the signed-in user's current ledger. The `Result` / `Batch` from
 * the application layer is shaped into a `Response` here, at the very edge,
 * and nowhere further in.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import * as Auth from '#lib/server/services/auth/application/auth.ts';
import * as Ledger from '#lib/server/services/ledger/application/ledger.ts';
import {
	fromBatch,
	fromResult,
	type Response,
	type ResultAsync,
} from '#lib/server/shared/result.ts';
import { Key } from './shared';
import { getTransactions } from './transactions.remote';

const CreateFile = v.object({ key: Key, content: v.string() });

const EditFile = v.object({
	key: Key,
	content: v.string(),
	version: v.string(),
});

const RenameFile = v.object({ key: Key, to: Key });

export const getFiles = query(async () =>
	fromBatch(await Auth.withCurrentUser(({ id }) => Ledger.listFiles(id))),
);

/**
 * One file as it is in storage. A command, not a query: it must never come
 * from a cache, since the file may have been edited behind the app's back.
 */
export const readFile = command(Key, async (k) =>
	fromResult(await Auth.withCurrentUser(({ id }) => Ledger.getFile(id, k))),
);

/**
 * Run a mutation in the current ledger, refreshing the file list and the
 * transactions with it.
 */
const mutate = async <T>(run: (userId: string) => ResultAsync<T>): Promise<Response<T>> => {
	const result = await Auth.withCurrentUser(({ id }) => run(id));
	void getFiles().refresh();
	void getTransactions().refresh();
	return fromResult(result);
};

export const createFile = command(CreateFile, ({ key, content }) =>
	mutate((u) => Ledger.createFile({ userId: u, key, content })),
);

export const editFile = command(EditFile, ({ key, content, version }) =>
	mutate((u) => Ledger.editFile({ userId: u, key, content, version })),
);

export const renameFile = command(RenameFile, ({ key, to }) =>
	mutate((u) => Ledger.renameFile({ userId: u, from: key, to })),
);

export const deleteFile = command(Key, (k) => mutate((u) => Ledger.deleteFile(u, k)));
