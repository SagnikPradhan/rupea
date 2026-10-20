import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Drafts from '#services/extraction/application/drafts.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import * as Statements from '#services/extraction/application/statements.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { viewTransaction } from '#services/ledger/application/shared.ts';
import { command, form } from '$app/server';
import * as v from 'valibot';
import { getFiles } from './files.remote';
import { getSchemas } from './schemas.remote';
import { Handle, inLedger, Key } from './shared';
import { getTransactions } from './transactions.remote';

export const uploadStatement = form(
	v.object({ handle: Handle, file: v.file() }),
	async ({ handle, file }) => {
		const upload = { name: file.name, content: new Uint8Array(await file.arrayBuffer()) };
		return replyFrom(
			await inLedger({ handle, action: (l) => Statements.uploadStatement(l, upload) }),
		);
	},
);

export const unlockStatement = form(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		password: v.pipe(v.string(), v.nonEmpty()),
	}),
	async ({ handle, ...options }) =>
		replyFrom(
			await inLedger({
				handle,
				action: (l) => Statements.unlockStatement({ ...options, ledger: l }),
			}),
		),
);

/** The schema that reads a statement, for the editor to start from. */
export const recogniseStatement = command(
	v.object({ handle: Handle, statement: v.pipe(v.string(), v.nonEmpty()) }),
	async ({ handle, statement }) =>
		replyFrom(await inLedger({ handle, action: (l) => Schemas.recogniseStatement(l, statement) })),
);

/** The draft a statement makes with an unsaved schema, checked as the ledger would read it. */
export const previewStatement = command(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
	}),
	async ({ handle, ...options }) => {
		const previewed = await inLedger({
			handle,
			action: (l) => Drafts.preview({ ...options, ledger: l }),
		});
		if (previewed.isErr()) return { ok: false, data: null, errors: [previewed.error] };

		const { key, transactions, failed } = previewed.value;
		const data = { key, transactions: transactions.map(viewTransaction) };
		return { ok: failed.length === 0, data, errors: failed };
	},
);

export const importStatement = form(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
		key: Key,
	}),
	async ({ handle, ...options }) => {
		const created = await inLedger({
			handle,
			action: (l) => Drafts.save({ ...options, ledger: l }),
		});
		void getFiles(handle).refresh();
		void getSchemas(handle).refresh();
		void getTransactions(handle).refresh();
		return replyFrom(created.map((f) => ({ key: f.key })));
	},
);

export const checkDraft = command(
	v.object({ key: Key, content: v.string() }),
	async ({ key, content }) => {
		const checked = Auth.withCurrentUser(() => ok(Ledger.check(key, content)));
		return replyFromBatch(
			await checked.map((batch) => ({
				...batch,
				succeeded: batch.succeeded.map(viewTransaction),
			})),
		);
	},
);
