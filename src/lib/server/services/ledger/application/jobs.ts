import type { Job } from '#services/jobs/application/jobs.ts';
import * as v from 'valibot';

const FetchPayload = v.object({ symbol: v.string() });

export type FetchPayload = v.InferOutput<typeof FetchPayload>;

/** Fetches a feed symbol's quotes. Every ledger shares a symbol, so its fetches run one at a time, whoever queued them. */
export const fetchQuotes: Job<FetchPayload> = {
	name: 'fetch-quotes',
	version: 1,
	payload: FetchPayload,
	retries: ['UnknownError', 'FeedUnavailable'],
	partition: (p) => p.symbol,
	dedupe: (p) => p.symbol,
};

const SyncPayload = v.object({ ledger: v.string(), full: v.optional(v.boolean()) });

export type SyncPayload = v.InferOutput<typeof SyncPayload>;

/** Syncs a ledger with its files. One ledger's syncs run one at a time, and a change while one waits joins it, unless only one of them reads every file again. */
export const syncLedger: Job<SyncPayload> = {
	name: 'sync-ledger',
	version: 1,
	payload: SyncPayload,
	partition: (p) => p.ledger,
	dedupe: (p) => (p.full ? `${p.ledger} full` : p.ledger),
};
