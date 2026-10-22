import type { Job } from '#services/jobs/application/jobs.ts';
import * as v from 'valibot';
import * as Quotes from '../application/quotes';

const FetchPayload = v.object({ symbol: v.string() });

/** Fetches a feed symbol's quotes. Every ledger shares a symbol, so its fetches run one at a time, whoever queued them. */
export const fetchQuotes: Job<v.InferOutput<typeof FetchPayload>> = {
	name: 'fetch-quotes',
	version: 1,
	payload: FetchPayload,
	retries: ['UnknownError', 'FeedUnavailable'],
	partition: (p) => p.symbol,
	dedupe: (p) => p.symbol,
	run: (p) => Quotes.fetchQuotes({ symbolId: p.symbol }),
};
