import { oc } from '@orpc/contract';
import { RupeaError } from '@rupea/shared/error.ts';
import { MOST_KEYS, SchemaContent, SchemaKey } from '@rupea/shared/files.ts';
import { MOST_PASSWORD, MOST_UPLOADS, StatementKey, Upload } from '@rupea/shared/statements.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Handle = v.string();

const Schema = v.object({ key: SchemaKey, content: SchemaContent });

const Contents = v.object({ key: v.string(), grid: v.array(v.array(v.string())) });

const Keys = v.pipe(v.array(StatementKey), v.minLength(1), v.maxLength(MOST_KEYS));

/**
 * Stores each statement and queues a job that drafts it, and answers the key of
 * each stored. The body is multipart/form-data with one part per file, each
 * named files[], files[0], files[1] and on.
 */
export const uploadStatements = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements',
		operationId: 'uploadStatements',
	})
	.input(
		v.object({
			handle: Handle,
			files: v.pipe(v.array(Upload), v.minLength(1), v.maxLength(MOST_UPLOADS)),
		}),
	)
	.errors(errors)
	.output(batchOf(v.string()));

/**
 * The statements uploaded lately, newest first, and the file each was imported
 * into.
 */
export const listStatements = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/statements', operationId: 'listStatements' })
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.object({ key: v.string(), file: v.nullable(v.string()) })));

/** The imports the caller queued in this ledger lately, newest first. */
export const listImports = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/imports', operationId: 'listImports' })
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

/** What a stored statement holds as one grid, not its bytes. */
export const readStatement = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements/content',
		operationId: 'readStatement',
	})
	.input(v.object({ handle: Handle, statement: StatementKey }))
	.errors(errors)
	.output(Contents);

/**
 * Deletes each statement on its own. The keys go in the body, as a query would
 * hold too few of them.
 */
export const deleteStatements = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/statements',
		operationId: 'deleteStatements',
	})
	.input(v.object({ handle: Handle, keys: Keys }))
	.errors(errors)
	.output(batchOf(v.string()));

/**
 * Replaces a locked statement with its content unlocked, and answers what it
 * holds. The password is not kept, and goes in the body so no URL holds it.
 */
export const unlockStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/unlock',
		operationId: 'unlockStatement',
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

/**
 * The schema that reads a statement, one of the ledger's or a built-in one, for
 * an editor to start from.
 */
export const recogniseStatement = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/statements/schema',
		operationId: 'recogniseStatement',
	})
	.input(v.object({ handle: Handle, statement: StatementKey }))
	.errors(errors)
	.output(v.object({ key: v.string(), content: v.string(), builtin: v.boolean() }));

/**
 * The draft a statement makes with an unsaved schema, checked as the ledger
 * would read it.
 */
export const previewStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/preview',
		operationId: 'previewStatement',
	})
	.input(v.object({ handle: Handle, statement: StatementKey, schema: Schema }))
	.errors(errors)
	.output(batchOf(TransactionOut));

/**
 * Files the draft a statement makes with a schema for review, and answers its
 * key.
 */
export const importStatement = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/statements/import',
		operationId: 'importStatement',
	})
	.input(v.object({ handle: Handle, statement: StatementKey, schema: Schema }))
	.errors(errors)
	.output(v.object({ key: v.string() }));
