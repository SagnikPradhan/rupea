import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { Day } from '@rupea/shared/dates.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';
import { Posting } from './outputs.ts';

const Filter = {
	handle: Handle,
	from: Day,
	to: Day,
	account: v.optional(v.string()),
	description: v.optional(v.string()),
};

const Cursor = v.object({
	date: v.pipe(v.string(), v.isoDate()),
	time: v.pipe(v.string(), v.isoTimeSecond()),
	id: v.pipe(v.string(), v.uuid()),
});

/** A query string carries the position as text. */
const PostingCursor = v.object({
	...Cursor.entries,
	position: v.union([v.number(), v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number))]),
});

const PostedCursor = v.object({ ...Cursor.entries, position: v.number() });

const Transaction = v.object({ id: v.string(), counted: v.boolean(), ...TransactionOut.entries });

export const listTransactions = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transactions',
		operationId: 'listTransactions',
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

export const listPostings = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/postings',
		operationId: 'listPostings',
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
