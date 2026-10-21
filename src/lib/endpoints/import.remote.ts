import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Drafts from '#services/extraction/application/drafts.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import * as Statements from '#services/extraction/application/statements.ts';
import * as Uploads from '#services/extraction/application/uploads.ts';
import * as Files from '#services/ledger/application/files.ts';
import { viewTransaction } from '#services/ledger/application/shared.ts';
import { command, form, query } from '$app/server';
import * as v from 'valibot';
import { getFiles } from './files.remote';
import { getSchemas } from './schemas.remote';
import { Handle, inLedger, Key } from './shared';

/** Statements to review, and ledger files, which import on their own as jobs. */
export const uploadStatements = form(
	v.object({ handle: Handle, files: v.pipe(v.array(v.file()), v.minLength(1)) }),
	async ({ handle, files }) => {
		const uploads = await Promise.all(
			files.map(async (f) => ({ name: f.name, content: new Uint8Array(await f.arrayBuffer()) })),
		);
		const uploaded = await inLedger({
			handle,
			action: (l, u) => Uploads.uploadStatements({ ledger: l, user: u.id, uploads }),
		});
		void getInbox(handle).refresh();
		void getImports(handle).refresh();
		return replyFromBatch(uploaded);
	},
);

/** Statements uploaded lately that nothing was imported from yet. */
export const getInbox = query(Handle, async (h) =>
	replyFrom(await inLedger({ handle: h, action: Uploads.listInbox })),
);

/** The ledger files this user uploaded here, as their imports run. */
export const getImports = query(Handle, async (h) =>
	replyFrom(await inLedger({ handle: h, action: (l, u) => Uploads.listImports(l, u.id) })),
);

/** A stored statement, read for the schema editor. */
export const openStatement = command(
	v.object({ handle: Handle, statement: v.pipe(v.string(), v.nonEmpty()) }),
	async ({ handle, statement }) =>
		replyFrom(
			await inLedger({
				handle,
				action: (l) =>
					Statements.findStatement(l, statement).map((s) => ({ key: s.key, grid: s.grid })),
			}),
		),
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

/** Files the draft for review under the review area's imports. */
export const importStatement = form(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
	}),
	async ({ handle, ...options }) => {
		const created = await inLedger({
			handle,
			action: (l) => Drafts.save({ ...options, ledger: l }),
		});
		void getFiles(handle).refresh();
		void getSchemas(handle).refresh();
		void getInbox(handle).refresh();
		return replyFrom(created.map((f) => ({ key: f.key })));
	},
);

export const checkDraft = command(
	v.object({ key: Key, content: v.string() }),
	async ({ key, content }) => {
		const checked = Auth.withCurrentUser(() => ok(Files.parseFile(key, content)));
		return replyFromBatch(
			await checked.map((batch) => ({
				...batch,
				succeeded: batch.succeeded.map(viewTransaction),
			})),
		);
	},
);
