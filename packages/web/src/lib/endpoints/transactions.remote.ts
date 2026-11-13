import { Day, spansOf } from '@rupea/shared/dates.ts';
import { Filter } from '@rupea/shared/filter.ts';
import { Handle } from '@rupea/shared/handle.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { replyFromCall } from './reply';
import { viewCounted, viewPosting } from './views';

const Cursor = v.object({
	date: v.pipe(v.string(), v.isoDate()),
	time: v.pipe(v.string(), v.isoTimeSecond()),
	id: v.pipe(v.string(), v.uuid()),
});
const PostingCursor = v.object({ ...Cursor.entries, position: v.number() });

export const listTransactions = query(
	v.object({ handle: Handle, day: Day, filter: Filter, after: v.nullable(Cursor) }),
	({ handle, day, filter, after }) =>
		replyFromCall(
			api()
				.listTransactions({ handle, ...listed(filter, day), after: after ?? undefined })
				.then((p) => ({ ...p, rows: p.rows.map(viewCounted) })),
		),
);

export const listPostings = query(
	v.object({ handle: Handle, day: Day, filter: Filter, after: v.nullable(PostingCursor) }),
	({ handle, day, filter, after }) =>
		replyFromCall(
			api()
				.listPostings({ handle, ...listed(filter, day), after: after ?? undefined })
				.then((p) => ({ ...p, rows: p.rows.map(viewPosting) })),
		),
);

const listed = (filter: Filter, day: Temporal.PlainDate) => {
	const { from, to } = spansOf(filter.period, day).current;

	return {
		from: from.toString(),
		to: to.toString(),
		account: filter.account || undefined,
		description: filter.description || undefined,
	};
};
