import type { Handler } from '#services/jobs/application/jobs.ts';
import { fetchQuotes, syncLedger, type FetchPayload, type SyncPayload } from '../application/jobs';
import { withLedger } from '../application/ledger';
import * as Quotes from '../application/quotes';
import * as Sync from '../application/sync';

const fetching: Handler<FetchPayload> = {
	job: fetchQuotes,
	run: (p) => Quotes.fetchQuotes({ symbolId: p.symbol }),
};

const syncing: Handler<SyncPayload> = {
	job: syncLedger,
	run: (p, u) =>
		withLedger({
			user: u,
			handle: p.ledger,
			action: p.full ? Sync.resyncLedger : Sync.syncLedger,
		}),
};

/** Every job the ledger runs. */
export const handlers: Handler<unknown>[] = [fetching, syncing];
