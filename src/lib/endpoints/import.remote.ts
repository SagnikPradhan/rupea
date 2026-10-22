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
		void listInbox(handle).refresh();
		void listImports(handle).refresh();
		return replyFromBatch(uploaded);
	},
);

/** Statements uploaded lately that nothing was imported from yet. */
export const listInbox = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Uploads.listInbox })),
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

export const unlockStatement = form(
	v.object({
		handle: Handle,
		statement: v.pipe(v.string(), v.nonEmpty()),
		password: v.pipe(v.string(), v.nonEmpty()),
	}),
	({ handle, ...options }) =>
		replyFrom(
			inLedger({
				handle,
				action: (l) => Statements.unlockStatement({ ...options, ledger: l }),
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
	({ handle, ...options }) =>
		replyFromBatch(
			inLedger({ handle, action: (l) => Drafts.previewStatement({ ...options, ledger: l }) }).map(
				(b) => ({
					...b,
					succeeded: b.succeeded.map(viewTransaction),
				}),
			),
		),
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
			action: (l) => Drafts.importStatement({ ...options, ledger: l }),
		});
		void listFiles(handle).refresh();
		void listSchemas(handle).refresh();
		void listInbox(handle).refresh();
		return replyFrom(created.map((f) => ({ key: f.key })));
	},
);
