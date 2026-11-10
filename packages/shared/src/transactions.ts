import * as v from 'valibot';
import { DayOut, TimeOut } from './dates.ts';
import { PostedOut } from './quantities.ts';

/** A transaction as a file holds it, with where it stands. */
export const TransactionOut = v.object({
	file: v.string(),
	line: v.number(),
	date: DayOut,
	time: v.nullable(TimeOut),
	description: v.string(),
	comment: v.nullable(v.string()),
	postings: v.array(v.object({ account: v.string(), quantity: PostedOut })),
});
