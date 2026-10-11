import * as v from 'valibot';
import { command, query } from '$app/server';
import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
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

// A command, not a query: never cached, as the file may change behind the app's back.
export const readFile = command(Key, async (k) =>
	fromResult(await Auth.withCurrentUser(({ id }) => Ledger.getFile(id, k))),
);

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
