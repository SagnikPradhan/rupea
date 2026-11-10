import { oc } from '@orpc/contract';
import { Day, DayOut } from '@rupea/shared/dates.ts';
import { PostedOut } from '@rupea/shared/quantities.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';

const Handle = v.string();

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

const Posting = v.object({
	transaction: v.string(),
	position: v.number(),
	file: v.string(),
	line: v.number(),
	date: DayOut,
	description: v.string(),
	account: v.string(),
	quantity: PostedOut,
});

/**
 * A page of transactions in a span, newest first; evidence of a group is listed
 * but not counted.
 */
export const listTransactions = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/transactions',
		operationId: 'listTransactions',
	})
	.input(v.object({ ...Filter, after: v.optional(Cursor) }))
	.errors(errors)
	.output(v.object({ rows: v.array(Transaction), next: v.nullable(Cursor) }));

/** A page of counted postings in a span, newest first. */
export const listPostings = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/postings', operationId: 'listPostings' })
	.input(v.object({ ...Filter, after: v.optional(PostingCursor) }))
	.errors(errors)
	.output(v.object({ rows: v.array(Posting), next: v.nullable(PostedCursor) }));
