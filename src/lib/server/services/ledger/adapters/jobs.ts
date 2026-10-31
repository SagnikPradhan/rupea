import type { Job } from '#services/jobs/application/jobs.ts';
import * as v from 'valibot';
import { withLedger } from '../application/ledger';
import * as Quotes from '../application/quotes';
import * as Sync from '../application/sync';

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

const SyncPayload = v.object({ ledger: v.string(), full: v.optional(v.boolean()) });

/** Syncs a ledger with its files. One ledger's syncs run one at a time, and a change while one waits joins it, unless only one of them reads every file again. */
export const syncLedger: Job<v.InferOutput<typeof SyncPayload>> = {
	name: 'sync-ledger',
	version: 1,
	payload: SyncPayload,
	partition: (p) => p.ledger,
	dedupe: (p) => (p.full ? `${p.ledger} full` : p.ledger),
	run: (p, u) =>
		withLedger({
			user: u,
			handle: p.ledger,
			action: p.full ? Sync.resyncLedger : Sync.syncLedger,
		}),
};
