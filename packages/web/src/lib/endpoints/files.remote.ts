import { fault } from '@rupea/shared/errors.ts';
import { Content, Draft, Key, Line, MOST_KEYS } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/text.ts';
import { TransactionForm } from '@rupea/shared/forms.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { listProblems } from './ledger.remote';
import { NOTHING, replyFromBatchCall, replyFromCall } from './reply';
import { viewTransaction } from './views';

export const listFiles = query(Handle, (h) => replyFromCall(api().files.list({ handle: h })));

export const findLatestFile = query(
	v.object({ handle: Handle, account: v.string() }),
	({ handle, account }) => replyFromCall(api().files.findLatest({ handle, account })),
);

export const findTransactionFiles = query(Handle, (h) =>
	replyFromCall(api().transactions.findFiles({ handle: h })),
);

export const createTransaction = command(
	v.object({ handle: Handle, form: TransactionForm }),
	async ({ handle, form }) => {
		const created = await replyFromCall(api().transactions.create({ handle, form }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return created;
	},
);

/**
 * Answers an id that is no id as a transaction that is not there, as a stale
 * link has one.
 */
export const findTransaction = query(
	v.object({ handle: Handle, id: v.string() }),
	({ handle, id }) =>
		v.is(v.pipe(v.string(), v.uuid()), id)
			? replyFromCall(api().transactions.find({ handle, id }))
			: Promise.resolve({
					ok: false,
					data: null,
					errors: [fault('TransactionNotFound', { path: id, line: 0 })],
				}),
);

export const saveTransaction = command(
	v.object({ handle: Handle, file: Key, line: Line, version: v.string(), form: TransactionForm }),
	async ({ handle, file, line, version, form }) => {
		const saved = await replyFromCall(
			api().transactions.save({ handle, file, line, version, form }),
		);
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return saved;
	},
);

export const deleteTransaction = command(
	v.object({ handle: Handle, file: Key, line: Line, version: v.string() }),
	async ({ handle, file, line, version }) => {
		const deleted = await replyFromCall(api().transactions.delete({ handle, file, line, version }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return deleted;
	},
);

/**
 * A command, not a query: never cached, as the file may change behind the app's
 * back.
 */
export const readFile = command(v.object({ handle: Handle, key: Key }), ({ handle, key }) =>
	replyFromCall(api().files.read({ handle, key })),
);

/** Tidies a draft's whitespace without saving it. */
export const formatFile = command(
	v.object({ handle: Handle, content: Draft }),
	({ handle, content }) => replyFromCall(api().files.format({ handle, content })),
);

export const parseFile = command(
	v.object({ handle: Handle, key: Key, content: Draft }),
	({ handle, key, content }) =>
		replyFromBatchCall(
			api()
				.files.parse({ handle, key, content })
				.then((b) => ({ ...b, succeeded: b.succeeded.map(viewTransaction) })),
		),
);

export const createFile = command(
	v.object({ handle: Handle, key: Key, content: Content }),
	async ({ handle, key, content }) => {
		const created = await replyFromCall(api().files.create({ handle, key, content }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return created;
	},
);

export const editFile = command(
	v.object({ handle: Handle, key: Key, content: Content, version: v.string() }),
	async ({ handle, key, content, version }) => {
		const edited = await replyFromCall(api().files.edit({ handle, key, content, version }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return edited;
	},
);

export const renameFiles = command(
	v.object({
		handle: Handle,
		moves: v.pipe(v.array(v.object({ from: Key, to: Key })), v.maxLength(MOST_KEYS)),
	}),
	async ({ handle, moves }) => {
		if (moves.length === 0) return NOTHING;

		const renamed = await replyFromBatchCall(api().files.rename({ handle, moves }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return renamed;
	},
);

export const addFile = command(
	v.object({ handle: Handle, from: Key, to: Key }),
	async ({ handle, from, to }) => {
		const added = await replyFromCall(api().files.add({ handle, from, to }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return added;
	},
);

export const deleteFiles = command(
	v.object({
		handle: Handle,
		keys: v.pipe(v.array(Key), v.maxLength(MOST_KEYS)),
	}),
	async ({ handle, keys }) => {
		if (keys.length === 0) return NOTHING;

		const deleted = await replyFromBatchCall(api().files.delete({ handle, keys }));
		void listFiles(handle).refresh();
		void listProblems(handle).refresh();
		return deleted;
	},
);
