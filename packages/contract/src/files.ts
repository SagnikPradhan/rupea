import { oc } from '@orpc/contract';
import { Content, Draft, EntryOut, FileOut, Key, Line, MOST_KEYS } from '@rupea/shared/files.ts';
import { TransactionForm, TransactionFormOut } from '@rupea/shared/transaction-form.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Version = v.string();

const Position = v.object({ file: v.string(), line: v.number() });

const Moves = v.pipe(
	v.array(v.object({ from: Key, to: Key })),
	v.minLength(1),
	v.maxLength(MOST_KEYS),
);

const Keys = v.pipe(v.array(Key), v.minLength(1), v.maxLength(MOST_KEYS));

const Addition = v.object({
	file: EntryOut,
	added: v.number(),
	skipped: v.number(),
	before: v.nullable(v.string()),
	draft: v.string(),
});

/** Every file of the ledger, without its text. */
export const listFiles = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/files', operationId: 'listFiles' })
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(EntryOut));

/**
 * The counted file holding an account's latest transaction, where its next ones
 * likely go.
 */
export const findLatestFile = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/latest-file',
		operationId: 'findLatestFile',
	})
	.input(v.object({ handle: Handle, account: v.string() }))
	.errors(errors)
	.output(v.nullable(v.string()));

/**
 * The files a new transaction can go in, and the one with the ledger's latest
 * transaction.
 */
export const findTransactionFiles = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transaction-files',
		operationId: 'findTransactionFiles',
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.object({ keys: v.array(v.string()), newest: v.nullable(v.string()) }));

/**
 * Adds a form's transaction to its file, or to a new file of that name, and
 * answers where it went.
 */
export const createTransaction = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/transactions',
		operationId: 'createTransaction',
	})
	.input(v.object({ handle: Handle, form: TransactionForm }))
	.errors(errors)
	.output(Position);

/**
 * The form of an indexed transaction, with where it stands and the version of
 * the file it was read from.
 */
export const findTransaction = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transactions/{id}',
		operationId: 'findTransaction',
	})
	.input(v.object({ handle: Handle, id: v.pipe(v.string(), v.uuid()) }))
	.errors(errors)
	.output(v.object({ ...Position.entries, version: Version, form: TransactionFormOut }));

/**
 * Rewrites the transaction at a line if its file is still the version it was
 * read as, and answers where it went.
 */
export const saveTransaction = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/transactions',
		operationId: 'saveTransaction',
	})
	.input(
		v.object({ handle: Handle, file: Key, line: Line, version: Version, form: TransactionForm }),
	)
	.errors(errors)
	.output(Position);

/**
 * Takes the transaction at a line out of its file if the file is still the
 * version it was read as. The position goes in the body, as a file key holds
 * slashes.
 */
export const deleteTransaction = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/transactions',
		operationId: 'deleteTransaction',
	})
	.input(v.object({ handle: Handle, file: Key, line: Line, version: Version }))
	.errors(errors);

/** A file with its text, as the ledger holds it now. */
export const readFile = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/files/content', operationId: 'readFile' })
	.input(v.object({ handle: Handle, key: Key }))
	.errors(errors)
	.output(FileOut);

/** A draft written as Rupea prints it, without saving it. */
export const formatFile = oc
	.route({ method: 'POST', path: '/ledgers/{handle}/files/format', operationId: 'formatFile' })
	.input(v.object({ handle: Handle, content: Draft }))
	.errors(errors)
	.output(v.string());

/** What a draft would hold, without storing it. */
export const parseFile = oc
	.route({ method: 'POST', path: '/ledgers/{handle}/files/parse', operationId: 'parseFile' })
	.input(v.object({ handle: Handle, key: Key, content: Draft }))
	.errors(errors)
	.output(batchOf(TransactionOut));

/** Makes a file that does not exist yet. */
export const createFile = oc
	.route({ method: 'POST', path: '/ledgers/{handle}/files', operationId: 'createFile' })
	.input(v.object({ handle: Handle, key: Key, content: Content }))
	.errors(errors)
	.output(FileOut);

/** Replaces a file's text, if it is still the version it was read as. */
export const editFile = oc
	.route({ method: 'PUT', path: '/ledgers/{handle}/files', operationId: 'editFile' })
	.input(v.object({ handle: Handle, key: Key, content: Content, version: Version }))
	.errors(errors)
	.output(FileOut);

/** Moves each file on its own, so a name already taken skips only that file. */
export const renameFiles = oc
	.route({ method: 'PATCH', path: '/ledgers/{handle}/files', operationId: 'renameFiles' })
	.input(v.object({ handle: Handle, moves: Moves }))
	.errors(errors)
	.output(batchOf(FileOut));

/**
 * Moves a draft to a new file, or merges it into the file there and deletes it,
 * and answers what undoing it takes.
 */
export const addFile = oc
	.route({ method: 'POST', path: '/ledgers/{handle}/files/additions', operationId: 'addFile' })
	.input(v.object({ handle: Handle, from: Key, to: Key }))
	.errors(errors)
	.output(Addition);

/**
 * Deletes each file on its own. The keys go in the body, as a query would hold
 * too few of them.
 */
export const deleteFiles = oc
	.route({ method: 'DELETE', path: '/ledgers/{handle}/files', operationId: 'deleteFiles' })
	.input(v.object({ handle: Handle, keys: Keys }))
	.errors(errors)
	.output(batchOf(v.string()));
