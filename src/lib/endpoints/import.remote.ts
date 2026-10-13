import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Extraction from '#services/extraction/application/extraction.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { viewTransaction } from '#services/ledger/application/shared.ts';
import { command, form } from '$app/server';
import * as v from 'valibot';
import { getFiles } from './files.remote';
import { getSchemas } from './schemas.remote';
import { Handle, inLedger, Key } from './shared';
import { getTransactions } from './transactions.remote';

export const readStatement = form(
	v.object({ handle: Handle, file: v.file() }),
	async ({ handle, file }) => {
		const upload = { name: file.name, content: new Uint8Array(await file.arrayBuffer()) };
		return replyFrom(
			await inLedger({ handle, action: (l) => Extraction.readStatement(l, upload) }),
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
				action: (l) => Extraction.unlockStatement({ ...options, ledger: l }),
			}),
		),
);

/** The schema that reads a statement, for the editor to start from. */
export const recogniseStatement = command(
	v.object({ handle: Handle, statement: v.pipe(v.string(), v.nonEmpty()) }),
	async ({ handle, statement }) =>
		replyFrom(
			await inLedger({ handle, action: (l) => Extraction.recogniseStatement(l, statement) }),
		),
);

/** The draft a statement makes with an unsaved schema, checked as the ledger would read it. */
export const previewStatement = command(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
	}),
	async ({ handle, ...options }) => {
		const draft = await inLedger({
			handle,
			action: (l) => Extraction.extract({ ...options, ledger: l }),
		});
		if (draft.isErr()) return { ok: false, data: null, errors: [draft.error] };

		const { key, content, failed } = draft.value;
		const checked = Ledger.check(key, content);
		const errors = [...failed, ...checked.failed];
		const transactions = checked.succeeded.map(viewTransaction);
		return { ok: errors.length === 0, data: { key, transactions }, errors };
	},
);

export const importStatement = form(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
		key: Key,
	}),
	async ({ handle, key, ...options }) => {
		const created = await inLedger({
			handle,
			action: (l) =>
				Extraction.extract({ ...options, ledger: l }).andThen((d) =>
					Extraction.keepSchema(l, options.schema).andThen(() =>
						Ledger.createFile({ ledger: l, key, content: d.content }),
					),
				),
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
