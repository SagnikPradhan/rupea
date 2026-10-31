import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import { TransactionForm } from '#lib/shared/transaction-form.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Files from '#services/ledger/application/files.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, Key } from './shared';
import { listProblems } from './ledger.remote';
import { viewTransaction } from './views';

export const listFiles = query(Handle, (h) =>
	replyFromBatch(inLedger({ handle: h, action: Files.listFiles })),
);

export const findLatestFile = query(
	v.object({ handle: Handle, account: v.string() }),
	({ handle, account }) =>
		replyFrom(inLedger({ handle, action: (l) => Files.findLatestFile({ ledger: l, account }) })),
);

export const findTransactionFiles = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Files.findTransactionFiles })),
);

export const createTransaction = command(
	v.object({ handle: Handle, form: TransactionForm }),
	async ({ handle, form }) => {
		const created = await inLedger({
			handle,
			action: (l) => Files.createTransaction({ ledger: l, form }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return replyFrom(created);
	},
);

/** A command, not a query: never cached, as the file may change behind the app's back. */
export const readFile = command(v.object({ handle: Handle, key: Key }), ({ handle, key }) =>
	replyFrom(inLedger({ handle, action: (l) => Files.readFile({ ledger: l, key }) })),
);

/** Tidies a draft's whitespace without saving it. */
export const formatFile = command(v.object({ content: v.string() }), ({ content }) =>
	replyFrom(Auth.withCurrentUser(() => ok(Files.formatFile({ content })))),
);

export const parseFile = command(v.object({ key: Key, content: v.string() }), ({ key, content }) =>
	replyFromBatch(
		Auth.withCurrentUser(() => ok(Files.parseFile({ key, content }))).map((b) => ({
			...b,
			succeeded: b.succeeded.map(viewTransaction),
		})),
	),
);

export const createFile = command(
	v.object({ handle: Handle, key: Key, content: v.string() }),
	async ({ handle, key, content }) => {
		const created = await inLedger({
			handle,
			action: (l) => Files.createFile({ ledger: l, key, content }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return replyFrom(created);
	},
);

export const editFile = command(
	v.object({ handle: Handle, key: Key, content: v.string(), version: v.string() }),
	async ({ handle, key, content, version }) => {
		const edited = await inLedger({
			handle,
			action: (l) => Files.editFile({ ledger: l, key, content, version }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return replyFrom(edited);
	},
);

export const renameFiles = command(
	v.object({ handle: Handle, moves: v.array(v.object({ from: Key, to: Key })) }),
	async ({ handle, moves }) => {
		const renamed = await inLedger({
			handle,
			action: (l) => Files.renameFiles({ ledger: l, moves }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return replyFromBatch(renamed);
	},
);

export const addFile = command(
	v.object({ handle: Handle, from: Key, to: Key }),
	async ({ handle, from, to }) => {
		const added = await inLedger({
			handle,
			action: (l) => Files.addFile({ ledger: l, from, to }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return replyFrom(added);
	},
);

export const deleteFiles = command(
	v.object({ handle: Handle, keys: v.array(Key) }),
	async ({ handle, keys }) => {
		const deleted = await inLedger({
			handle,
			action: (l) => Files.deleteFiles({ ledger: l, keys }),
		});
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return replyFromBatch(deleted);
	},
);
