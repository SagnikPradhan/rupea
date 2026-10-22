import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { Day, startOf } from '#lib/shared/dates.ts';
import { Filter } from '#lib/shared/filter.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import * as Transactions from '#services/ledger/application/transactions.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger } from './shared';
import { viewCounted, viewPosting } from './views';

const Cursor = v.object({ date: v.string(), time: v.string(), id: v.pipe(v.string(), v.uuid()) });
const PostingCursor = v.object({ ...Cursor.entries, position: v.number() });

/** What is wrong across the ledger, after bringing its index up to date; lists read that index. */
export const sync = query(Handle, (h) =>
	replyFromBatch(inLedger({ handle: h, action: Sync.sync })),
);

export const listTransactions = query(
	v.object({ handle: Handle, day: Day, filter: Filter, after: v.nullable(Cursor) }),
	({ handle, day, filter, after }) =>
		replyFrom(
			inLedger({
				handle,
				action: (l) =>
					Transactions.listTransactions({ ledger: l, filter: listed(filter, day), after }),
			}).map((p) => ({ ...p, rows: p.rows.map(viewCounted) })),
		),
);

export const listPostings = query(
	v.object({ handle: Handle, day: Day, filter: Filter, after: v.nullable(PostingCursor) }),
	({ handle, day, filter, after }) =>
		replyFrom(
			inLedger({
				handle,
				action: (l) => Transactions.listPostings({ ledger: l, filter: listed(filter, day), after }),
			}).map((p) => ({ ...p, rows: p.rows.map(viewPosting) })),
		),
);

export const listAccountNames = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Transactions.listAccountNames })),
);

const listed = (filter: Filter, day: Temporal.PlainDate): Transactions.ListFilter => ({
	from: startOf[filter.range](day),
	to: day,
	account: filter.account || null,
	description: filter.description || null,
});
