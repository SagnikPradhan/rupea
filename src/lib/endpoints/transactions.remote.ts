import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { Day, startOf } from '#lib/shared/dates.ts';
import { Filter } from '#lib/shared/filter.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import * as Transactions from '#services/ledger/application/transactions.ts';
import { viewPosting, viewTransaction } from '#services/ledger/application/shared.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger } from './shared';

const Cursor = v.object({ date: v.string(), time: v.string(), id: v.pipe(v.string(), v.uuid()) });
const PostingCursor = v.object({ ...Cursor.entries, position: v.number() });

const TransactionsQuery = v.object({
	handle: Handle,
	day: Day,
	filter: Filter,
	after: v.nullable(Cursor),
});
const PostingsQuery = v.object({
	handle: Handle,
	day: Day,
	filter: Filter,
	after: v.nullable(PostingCursor),
});

/** What is wrong across the ledger, after bringing its index up to date; lists read that index. */
export const getIssues = query(Handle, async (h) => {
	const issues = inLedger({ handle: h, action: Sync.sync });
	return replyFromBatch(await issues.map((f) => ({ succeeded: [], failed: f })));
});

export const getTransactions = query(TransactionsQuery, async ({ handle, day, filter, after }) => {
	const page = inLedger({
		handle,
		action: (l) => Transactions.listTransactions({ ledger: l, filter: listed(filter, day), after }),
	});

	return replyFrom(await page.map((p) => ({ ...p, rows: p.rows.map(viewCounted) })));
});

export const getPostings = query(PostingsQuery, async ({ handle, day, filter, after }) => {
	const page = inLedger({
		handle,
		action: (l) => Transactions.listPostings({ ledger: l, filter: listed(filter, day), after }),
	});

	return replyFrom(await page.map((p) => ({ ...p, rows: p.rows.map(viewListed) })));
});

export const getAccountNames = query(Handle, async (h) =>
	replyFrom(await inLedger({ handle: h, action: Transactions.listAccountNames })),
);

const listed = (filter: Filter, day: Temporal.PlainDate): Transactions.ListFilter => ({
	from: startOf[filter.range](day),
	to: day,
	account: filter.account || null,
	description: filter.description || null,
});

const viewCounted = ({ id, counted, ...transaction }: Transactions.CountedTransaction) => ({
	id,
	counted,
	...viewTransaction(transaction),
});

const viewListed = (listed: Transactions.ListedPosting) => ({
	key: `${listed.transaction}:${listed.position}`,
	file: listed.location.file,
	line: listed.location.line,
	date: listed.date.toString(),
	description: listed.description,
	...viewPosting(listed.posting),
});
