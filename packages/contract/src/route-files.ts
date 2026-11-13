import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { Content, Draft, EntryOut, FileOut, Key } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import { Addition, FileKeys, Moves, Version } from './shape-files.ts';
import { TransactionOut } from './shape-ledger.ts';

const listFiles = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/files',
		operationId: 'files.list',
		description: dedent`
			Lists every file of the ledger by key, without its text.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(EntryOut));

const findLatestFile = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/latest-file',
		operationId: 'files.findLatest',
		description: dedent`
			Answers the key of the counted file holding an account's latest
			transaction, where its next ones likely go, or null when it has none.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, account: v.string() }))
	.errors(errors)
	.output(v.nullable(v.string()));

const readFile = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/files/content',
		operationId: 'files.read',
		description: dedent`
			Answers a file with its text and version, as the ledger holds it now.

			Fails with StorageNotFound when there is no such file. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key }))
	.errors(errors)
	.output(FileOut);

const formatFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files/format',
		operationId: 'files.format',
		description: dedent`
			Answers a draft written as Rupea prints it, without saving it.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, content: Draft }))
	.errors(errors)
	.output(v.string());

const parseFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files/parse',
		operationId: 'files.parse',
		description: dedent`
			Answers the transactions a draft would hold, and why the rest do not read,
			without storing it.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key, content: Draft }))
	.errors(errors)
	.output(batchOf(TransactionOut));

const createFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files',
		operationId: 'files.create',
		description: dedent`
			Makes a file that does not exist yet and answers it.

			Fails with StorageInvalidKey when the key is not valid. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key, content: Content }))
	.errors(errors)
	.output(FileOut);

const editFile = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/files',
		operationId: 'files.edit',
		description: dedent`
			Replaces a file's text and answers the file.

			Fails with StorageConflict when the file has changed since the version
			given. Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: Key, content: Content, version: Version }))
	.errors(errors)
	.output(FileOut);

const renameFiles = oc
	.route({
		method: 'PATCH',
		path: '/ledgers/{handle}/files',
		operationId: 'files.rename',
		description: dedent`
			Moves each file on its own, so a name already taken fails only that file.
			Answers the files moved, and why the rest were not.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, moves: Moves }))
	.errors(errors)
	.output(batchOf(FileOut));

const addFile = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/files/additions',
		operationId: 'files.add',
		description: dedent`
			Moves a draft to a new file, or merges it into the file there and deletes
			the draft, and answers what undoing it takes.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, from: Key, to: Key }))
	.errors(errors)
	.output(Addition);

const deleteFiles = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/files',
		operationId: 'files.delete',
		description: dedent`
			Deletes each file on its own and answers the keys deleted, and why the
			rest were not. The keys go in the body, as a query would hold too few of
			them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, keys: FileKeys }))
	.errors(errors)
	.output(batchOf(v.string()));

export const files = {
	list: listFiles,
	findLatest: findLatestFile,
	read: readFile,
	format: formatFile,
	parse: parseFile,
	create: createFile,
	edit: editFile,
	rename: renameFiles,
	add: addFile,
	delete: deleteFiles,
};
