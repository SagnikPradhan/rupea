import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { RupeaError } from '@rupea/shared/error.ts';
import { MOST_KEYS, Schema } from '@rupea/shared/files.ts';
import { MOST_PASSWORD, MOST_UPLOADS, StatementKey, Upload } from '@rupea/shared/statements.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Contents = v.object({ key: v.string(), grid: v.array(v.array(v.string())) });

const Keys = v.pipe(v.array(StatementKey), v.minLength(1), v.maxLength(MOST_KEYS));

export const uploadStatements = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements',
		operationId: 'uploadStatements',
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

export const listStatements = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements',
		operationId: 'listStatements',
		description: dedent`
			Lists the statements uploaded lately, newest first, with the file each was
			imported into, or null before it is.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.object({ key: v.string(), file: v.nullable(v.string()) })));

export const listImports = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/imports',
		operationId: 'listImports',
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

export const readStatement = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements/content',
		operationId: 'readStatement',
		description: dedent`
			Answers what a stored statement holds as one grid of text, not its bytes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey }))
	.errors(errors)
	.output(Contents);

export const deleteStatements = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/statements',
		operationId: 'deleteStatements',
		description: dedent`
			Deletes each statement on its own and answers the keys deleted, and why
			the rest were not. The keys go in the body, as a query would hold too few
			of them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, keys: Keys }))
	.errors(errors)
	.output(batchOf(v.string()));

export const unlockStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/unlock',
		operationId: 'unlockStatement',
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

export const recogniseStatement = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements/schema',
		operationId: 'recogniseStatement',
		description: dedent`
			Answers the schema that reads a statement, one of the ledger's or a
			built-in one, for an editor to start from.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey }))
	.errors(errors)
	.output(v.object({ key: v.string(), content: v.string(), builtin: v.boolean() }));

export const previewStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/preview',
		operationId: 'previewStatement',
		description: dedent`
			Answers the draft a statement makes with an unsaved schema, checked as the
			ledger would read it, and why any row does not read.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey, schema: Schema }))
	.errors(errors)
	.output(batchOf(TransactionOut));

export const importStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/import',
		operationId: 'importStatement',
		description: dedent`
			Files the draft a statement makes with a schema for review, and answers
			its key.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, statement: StatementKey, schema: Schema }))
	.errors(errors)
	.output(v.object({ key: v.string() }));
