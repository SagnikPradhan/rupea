import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import {
	index,
	type CountedTransaction,
	type Cursor,
	type ListedPosting,
	type ListFilter,
	type Page,
	type PostingCursor,
} from '../adapters/database';
import type { Ledger } from '../domain/types';

export type { CountedTransaction, Cursor, ListedPosting, ListFilter, Page, PostingCursor };

/** A transaction lists with its postings, so a page holds fewer of them than of postings. */
const TRANSACTIONS_PER_PAGE = 100;
const POSTINGS_PER_PAGE = 200;

type ListTransactionsOptions = { ledger: Ledger; filter: ListFilter; after: Cursor | null };

/** A page of transactions, newest first; evidence of an event is listed but not counted. */
export const listTransactions = (
	options: ListTransactionsOptions,
): ResultAsync<Page<CountedTransaction, Cursor>> =>
	index(options.ledger.id).transactionPage({
		filter: options.filter,
		after: options.after,
		limit: TRANSACTIONS_PER_PAGE,
	});

type ListPostingsOptions = { ledger: Ledger; filter: ListFilter; after: PostingCursor | null };

/** A page of counted postings, newest first. */
export const listPostings = (
	options: ListPostingsOptions,
): ResultAsync<Page<ListedPosting, PostingCursor>> =>
	index(options.ledger.id).postingPage({
		filter: options.filter,
		after: options.after,
		limit: POSTINGS_PER_PAGE,
	});

/** Every account the ledger posts to, by name. */
export const listAccountNames = (l: Ledger): ResultAsync<string[]> => index(l.id).accountNames();
