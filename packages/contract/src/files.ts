import { oc } from '@orpc/contract';
import dedent from 'dedent';
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

export const listFiles = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/files',
		operationId: 'listFiles',
		description: dedent`
			Lists every file of the ledger by key, without its text.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(EntryOut));

export const findLatestFile = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/latest-file',
		operationId: 'findLatestFile',
		description: dedent`
			Answers the key of the counted file holding an account's latest
			transaction, where its next ones likely go, or null when it has none.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, account: v.string() }))
	.errors(errors)
	.output(v.nullable(v.string()));

export const findTransactionFiles = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transaction-files',
		operationId: 'findTransactionFiles',
		description: dedent`
			Lists the keys of the files a new transaction can go in, and the key of
			the one with the ledger's latest transaction.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.object({ keys: v.array(v.string()), newest: v.nullable(v.string()) }));

export const createTransaction = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/transactions',
		operationId: 'createTransaction',
		description: dedent`
			Adds a form's transaction to its file, or to a new file of that name, and
			answers where it went.

			Fails with StorageInvalidKey when the file name is not a valid key. Fails
			with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, form: TransactionForm }))
	.errors(errors)
	.output(Position);

export const findTransaction = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transactions/{id}',
		operationId: 'findTransaction',
		description: dedent`
			Answers the form of an indexed transaction by id, with the file and line
			it stands at and the version of the file it was read from.

			Fails with TransactionNotFound when the ledger has no such transaction.
			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, id: v.pipe(v.string(), v.uuid()) }))
	.errors(errors)
	.output(v.object({ ...Position.entries, version: Version, form: TransactionFormOut }));

export const saveTransaction = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/transactions',
		operationId: 'saveTransaction',
		description: dedent`
			Rewrites the transaction at a line of a file, and answers where it went.

			Fails with TransactionNotFound when no transaction starts at that line.
			Fails with StorageConflict when the file has changed since the version
			given. Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(
		v.object({ handle: Handle, file: Key, line: Line, version: Version, form: TransactionForm }),
	)
	.errors(errors)
	.output(Position);

export const deleteTransaction = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/transactions',
		operationId: 'deleteTransaction',
		description: dedent`
			Takes the transaction at a line out of its file. The position goes in the
			body, as a file key holds slashes.

			Fails with TransactionNotFound when no transaction starts at that line.
			Fails with StorageConflict when the file has changed since the version
			given. Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, file: Key, line: Line, version: Version }))
	.errors(errors);

export const readFile = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/files/content',
		operationId: 'readFile',
		description: dedent`
			Answers a file with its text and version, as the ledger holds it now.

			Fails with StorageNotFound when there is no such file. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key }))
	.errors(errors)
	.output(FileOut);

export const formatFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files/format',
		operationId: 'formatFile',
		description: dedent`
			Answers a draft written as Rupea prints it, without saving it.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, content: Draft }))
	.errors(errors)
	.output(v.string());

export const parseFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files/parse',
		operationId: 'parseFile',
		description: dedent`
			Answers the transactions a draft would hold, and why the rest do not read,
			without storing it.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key, content: Draft }))
	.errors(errors)
	.output(batchOf(TransactionOut));

export const createFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files',
		operationId: 'createFile',
		description: dedent`
			Makes a file that does not exist yet and answers it.

			Fails with StorageInvalidKey when the key is not valid. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key, content: Content }))
	.errors(errors)
	.output(FileOut);

export const editFile = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/files',
		operationId: 'editFile',
		description: dedent`
			Replaces a file's text and answers the file.

			Fails with StorageConflict when the file has changed since the version
			given. Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key, content: Content, version: Version }))
	.errors(errors)
	.output(FileOut);

export const renameFiles = oc
	.route({
		method: 'PATCH',
		path: '/ledgers/{handle}/files',
		operationId: 'renameFiles',
		description: dedent`
			Moves each file on its own, so a name already taken fails only that file.
			Answers the files moved, and why the rest were not.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, moves: Moves }))
	.errors(errors)
	.output(batchOf(FileOut));

export const addFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files/additions',
		operationId: 'addFile',
		description: dedent`
			Moves a draft to a new file, or merges it into the file there and deletes
			the draft, and answers what undoing it takes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, from: Key, to: Key }))
	.errors(errors)
	.output(Addition);

export const deleteFiles = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/files',
		operationId: 'deleteFiles',
		description: dedent`
			Deletes each file on its own and answers the keys deleted, and why the
			rest were not. The keys go in the body, as a query would hold too few of
			them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, keys: Keys }))
	.errors(errors)
	.output(batchOf(v.string()));
