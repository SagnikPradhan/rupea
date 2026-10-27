import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Drafts from '#services/extraction/application/drafts.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import * as Statements from '#services/extraction/application/statements.ts';
import * as Uploads from '#services/extraction/application/uploads.ts';
import { command, form, query } from '$app/server';
import * as v from 'valibot';
import { listFiles } from './files.remote';
import { listSchemas } from './schemas.remote';
import { Handle, inLedger } from './shared';
import { viewTransaction } from './views';

/** Statements to review, and ledger files, which import on their own as jobs. */
export const uploadStatements = form(
	v.object({ handle: Handle, files: v.pipe(v.array(v.file()), v.minLength(1)) }),
	async ({ handle, files }) => {
		const uploads = await Promise.all(
			files.map((f) => f.arrayBuffer().then((b) => ({ name: f.name, content: new Uint8Array(b) }))),
		);
		const uploaded = await inLedger({
			handle,
			action: (l, u) => Uploads.uploadStatements({ ledger: l, user: u.id, uploads }),
		});
		void listStatements(handle).refresh();
		void listImports(handle).refresh();
		return replyFromBatch(uploaded);
	},
);

/** Statements uploaded lately, whether a file was imported from each, and whether a job imports it. */
export const listStatements = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Uploads.listStatements })),
);

/** The ledger files this user uploaded here, as their imports run. */
export const listImports = query(Handle, (h) =>
	replyFrom(
		inLedger({ handle: h, action: (l, u) => Uploads.listImports({ ledger: l, user: u.id }) }),
	),
);

/** A stored statement, read for the schema editor. */
export const readStatement = command(
	v.object({ handle: Handle, statement: v.pipe(v.string(), v.nonEmpty()) }),
	({ handle, statement }) =>
		replyFrom(
			inLedger({
				handle,
				action: (l) => Statements.readStatement({ ledger: l, key: statement }),
			}).map((s) => ({ key: s.key, grid: s.grid })),
		),
);

export const deleteStatements = command(
	v.object({ handle: Handle, keys: v.array(v.pipe(v.string(), v.nonEmpty())) }),
	async ({ handle, keys }) => {
		const deleted = await inLedger({
			handle,
			action: (l) => Statements.deleteStatements({ ledger: l, keys }),
		});
		void listStatements(handle).refresh();
		return replyFromBatch(deleted);
	},
);

export const unlockStatement = form(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		password: v.pipe(v.string(), v.nonEmpty()),
	}),
	({ handle, statement, password }) =>
		replyFrom(
			inLedger({
				handle,
				action: (l) => Statements.unlockStatement({ ledger: l, statement, password }),
			}),
		),
);

/** The schema that reads a statement, for the editor to start from. */
export const recogniseStatement = command(
	v.object({ handle: Handle, statement: v.pipe(v.string(), v.nonEmpty()) }),
	({ handle, statement }) =>
		replyFrom(
			inLedger({
				handle,
				action: (l) => Schemas.recogniseStatement({ ledger: l, statement }),
			}),
		),
);

/** The draft a statement makes with an unsaved schema, checked as the ledger would read it. */
export const previewStatement = command(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
	}),
	({ handle, statement, schema }) =>
		replyFromBatch(
			inLedger({
				handle,
				action: (l) => Drafts.previewStatement({ ledger: l, statement, schema }),
			}).map((b) => ({
				...b,
				succeeded: b.succeeded.map(viewTransaction),
			})),
		),
);

/** Files the draft for review under the review area's imports. */
export const importStatement = command(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		schema: v.object({ key: v.string(), content: v.string() }),
	}),
	async ({ handle, statement, schema }) => {
		const created = await inLedger({
			handle,
			action: (l) => Drafts.importStatement({ ledger: l, statement, schema }),
		});
		void listFiles(handle).refresh();
		void listSchemas(handle).refresh();
		void listStatements(handle).refresh();
		return replyFrom(created.map((f) => ({ key: f.key })));
	},
);
