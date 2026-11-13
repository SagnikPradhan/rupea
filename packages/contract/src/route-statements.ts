import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { RupeaError } from '@rupea/shared/errors.ts';
import { Schema, MOST_PASSWORD, MOST_UPLOADS, StatementKey, Upload } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import { Contents, StatementKeys } from './shape-files.ts';
import { TransactionOut } from './shape-ledger.ts';

const uploadStatements = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements',
		operationId: 'statements.upload',
		description: dedent`
			Stores each statement and queues a job that drafts it, and answers the key
			of each stored, and why the rest were not. The body is multipart/form-data
			with one part per file, each named files[], files[0], files[1] and on.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(
		v.object({
			handle: Handle,
			files: v.pipe(v.array(Upload), v.minLength(1), v.maxLength(MOST_UPLOADS)),
		}),
	)
	.errors(errors)
	.output(batchOf(v.string()));

const listStatements = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements',
		operationId: 'statements.list',
		description: dedent`
			Lists the statements uploaded lately, newest first, with the file each was
			imported into, or null before it is.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.object({ key: v.string(), file: v.nullable(v.string()) })));

const listImports = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/imports',
		operationId: 'statements.listImports',
		description: dedent`
			Lists the imports the caller queued in this ledger lately, newest first,
			with each one's status and the error it failed with.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(
		v.array(
			v.object({
				id: v.string(),
				status: v.picklist(['queued', 'running', 'succeeded', 'failed']),
				statement: v.string(),
				error: v.nullable(RupeaError),
			}),
		),
	);

const readStatement = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements/content',
		operationId: 'statements.read',
		description: dedent`
			Answers what a stored statement holds as one grid of text, not its bytes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey }))
	.errors(errors)
	.output(Contents);

const deleteStatements = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/statements',
		operationId: 'statements.delete',
		description: dedent`
			Deletes each statement on its own and answers the keys deleted, and why
			the rest were not. The keys go in the body, as a query would hold too few
			of them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, keys: StatementKeys }))
	.errors(errors)
	.output(batchOf(v.string()));

const unlockStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/unlock',
		operationId: 'statements.unlock',
		description: dedent`
			Replaces a locked statement with its content unlocked, and answers what it
			holds. The password is not kept, and goes in the body so no URL holds it.

			Fails with ExtractionLocked when the password does not unlock it. Fails
			with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(
		v.object({
			handle: Handle,
			statement: StatementKey,
			password: v.pipe(v.string(), v.nonEmpty(), v.maxLength(MOST_PASSWORD)),
		}),
	)
	.errors(errors)
	.output(Contents);

const recogniseStatement = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements/schema',
		operationId: 'statements.recognise',
		description: dedent`
			Answers the schema that reads a statement, one of the ledger's or a
			built-in one, for an editor to start from.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey }))
	.errors(errors)
	.output(v.object({ key: v.string(), content: v.string(), builtin: v.boolean() }));

const previewStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/preview',
		operationId: 'statements.preview',
		description: dedent`
			Answers the draft a statement makes with an unsaved schema, checked as the
			ledger would read it, and why any row does not read.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey, schema: Schema }))
	.errors(errors)
	.output(batchOf(TransactionOut));

const importStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/import',
		operationId: 'statements.import',
		description: dedent`
			Files the draft a statement makes with a schema for review, and answers
			its key.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey, schema: Schema }))
	.errors(errors)
	.output(v.object({ key: v.string() }));

export const statements = {
	upload: uploadStatements,
	list: listStatements,
	listImports,
	read: readStatement,
	delete: deleteStatements,
	unlock: unlockStatement,
	recognise: recogniseStatement,
	preview: previewStatement,
	import: importStatement,
};
