import { MOST_KEYS, Schema } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/handle.ts';
import { MOST_PASSWORD, MOST_UPLOADS, StatementKey, Upload } from '@rupea/shared/statements.ts';
import { command, form, query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { listFiles } from './files.remote';
import { NOTHING, replyFromBatchCall, replyFromCall } from './reply';
import { listSchemas } from './schemas.remote';
import { viewTransaction } from './views';

/** Statements to review, and ledger files, which import on their own as jobs. */
export const uploadStatements = form(
	v.object({
		handle: Handle,
		files: v.pipe(v.array(Upload), v.minLength(1), v.maxLength(MOST_UPLOADS)),
	}),
	async ({ handle, files }) => {
		const uploaded = await replyFromBatchCall(api().statements.upload({ handle, files }));
		void listStatements(handle).refresh();
		void listImports(handle).refresh();
		return uploaded;
	},
);

/**
 * Statements uploaded lately, whether a file was imported from each, and
 * whether a job imports it.
 */
export const listStatements = query(Handle, (h) =>
	replyFromCall(api().statements.list({ handle: h })),
);

/** The ledger files this user uploaded here, as their imports run. */
export const listImports = query(Handle, (h) =>
	replyFromCall(api().statements.listImports({ handle: h })),
);

/** A stored statement, read for the schema editor. */
export const readStatement = command(
	v.object({ handle: Handle, statement: StatementKey }),
	({ handle, statement }) => replyFromCall(api().statements.read({ handle, statement })),
);

export const deleteStatements = command(
	v.object({
		handle: Handle,
		keys: v.pipe(v.array(StatementKey), v.maxLength(MOST_KEYS)),
	}),
	async ({ handle, keys }) => {
		if (keys.length === 0) return NOTHING;

		const deleted = await replyFromBatchCall(api().statements.delete({ handle, keys }));
		void listStatements(handle).refresh();
		return deleted;
	},
);

export const unlockStatement = form(
	v.object({
		handle: Handle,
		statement: StatementKey,
		password: v.pipe(v.string(), v.nonEmpty(), v.maxLength(MOST_PASSWORD)),
	}),
	({ handle, statement, password }) =>
		replyFromCall(api().statements.unlock({ handle, statement, password })),
);

/** The schema that reads a statement, for the editor to start from. */
export const recogniseStatement = command(
	v.object({ handle: Handle, statement: StatementKey }),
	({ handle, statement }) => replyFromCall(api().statements.recognise({ handle, statement })),
);

/**
 * The draft a statement makes with an unsaved schema, checked as the ledger
 * would read it.
 */
export const previewStatement = command(
	v.object({ handle: Handle, statement: StatementKey, schema: Schema }),
	({ handle, statement, schema }) =>
		replyFromBatchCall(
			api()
				.statements.preview({ handle, statement, schema })
				.then((b) => ({ ...b, succeeded: b.succeeded.map(viewTransaction) })),
		),
);

/** Files the draft for review under the review area's imports. */
export const importStatement = command(
	v.object({ handle: Handle, statement: StatementKey, schema: Schema }),
	async ({ handle, statement, schema }) => {
		const created = await replyFromCall(api().statements.import({ handle, statement, schema }));
		void listFiles(handle).refresh();
		void listSchemas(handle).refresh();
		void listStatements(handle).refresh();
		return created;
	},
);
