import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import type { Ledger } from '../domain/types';

export type {
	CountedTransaction,
	Cursor,
	ListedPosting,
	ListFilter,
	Page,
	PostingCursor,
} from '../adapters/database';

/** A transaction lists with its postings, so a page holds fewer of them than of postings. */
const TRANSACTIONS_PER_PAGE = 100;
const POSTINGS_PER_PAGE = 200;

type ListOptions<C> = { ledger: Ledger; filter: DB.ListFilter; after: C | null };

/** A page of transactions, newest first; evidence of an event is listed but not counted. */
export const listTransactions = ({
	ledger,
	filter,
	after,
}: ListOptions<DB.Cursor>): ResultAsync<DB.Page<DB.CountedTransaction, DB.Cursor>> =>
	DB.listTransactions(ledger.id, { filter, after, limit: TRANSACTIONS_PER_PAGE });

/** A page of counted postings, newest first. */
export const listPostings = ({
	ledger,
	filter,
	after,
}: ListOptions<DB.PostingCursor>): ResultAsync<DB.Page<DB.ListedPosting, DB.PostingCursor>> =>
	DB.listPostings(ledger.id, { filter, after, limit: POSTINGS_PER_PAGE });

/** Every account the ledger posts to, by name. */
export const listAccountNames = (l: Ledger): ResultAsync<string[]> => DB.listAccountNames(l.id);

/** The day of the ledger's first transaction, or none before it has one. */
export const findFirstDay = (l: Ledger): ResultAsync<Temporal.PlainDate | null> =>
	DB.findFirstDay(l.id);
