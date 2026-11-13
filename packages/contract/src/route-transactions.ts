import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { Key, Line } from '@rupea/shared/files.ts';
import { TransactionForm, TransactionFormOut } from '@rupea/shared/forms.ts';
import { Handle } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';
import { Version } from './shape-files.ts';
import {
	Cursor,
	Filter,
	Location,
	PostedCursor,
	Posting,
	PostingCursor,
	Transaction,
} from './shape-ledger.ts';

const listTransactions = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transactions',
		operationId: 'transactions.list',
		description: dedent`
			Lists a page of transactions between from and to, newest first, optionally
			narrowed to an account or a description. Evidence of a group is listed but
			not counted. Pass the next cursor as after to read the following page.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ ...Filter, after: v.optional(Cursor) }))
	.errors(errors)
	.output(v.object({ rows: v.array(Transaction), next: v.nullable(Cursor) }));

const listPostings = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/postings',
		operationId: 'transactions.listPostings',
		description: dedent`
			Lists a page of counted postings between from and to, newest first,
			optionally narrowed to an account or a description. Pass the next cursor
			as after to read the following page.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ ...Filter, after: v.optional(PostingCursor) }))
	.errors(errors)
	.output(v.object({ rows: v.array(Posting), next: v.nullable(PostedCursor) }));

const findTransactionFiles = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transaction-files',
		operationId: 'transactions.findFiles',
		description: dedent`
			Lists the keys of the files a new transaction can go in, and the key of
			the one with the ledger's latest transaction.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.object({ keys: v.array(v.string()), newest: v.nullable(v.string()) }));

const createTransaction = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/transactions',
		operationId: 'transactions.create',
		description: dedent`
			Adds a form's transaction to its file, or to a new file of that name, and
			answers where it went.

			Fails with StorageInvalidKey when the file name is not a valid key. Fails
			with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, form: TransactionForm }))
	.errors(errors)
	.output(Location);

const findTransaction = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transactions/{id}',
		operationId: 'transactions.find',
		description: dedent`
			Answers the form of an indexed transaction by id, with the file and line
			it stands at and the version of the file it was read from.

			Fails with TransactionNotFound when the ledger has no such transaction.
			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, id: v.pipe(v.string(), v.uuid()) }))
	.errors(errors)
	.output(v.object({ ...Location.entries, version: Version, form: TransactionFormOut }));

const saveTransaction = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/transactions',
		operationId: 'transactions.save',
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
	.output(Location);

const deleteTransaction = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/transactions',
		operationId: 'transactions.delete',
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

export const transactions = {
	list: listTransactions,
	listPostings,
	create: createTransaction,
	find: findTransaction,
	save: saveTransaction,
	delete: deleteTransaction,
	findFiles: findTransactionFiles,
};
