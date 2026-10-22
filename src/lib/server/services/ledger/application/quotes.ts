import { withContext } from '#lib/server/shared/context/context.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import type { ListQuotes } from '../adapters/feed';
import * as Mfapi from '../adapters/feed-mfapi';
import * as Yahoo from '../adapters/feed-yahoo';
import { Feed, PriceSource } from '../domain/types';

/** How each feed is asked for quotes, and the source they are saved as; a ledger's own symbols are priced by its files. */
const FEEDS: Partial<Record<Feed, { listQuotes: ListQuotes; source: PriceSource }>> = {
	[Feed.Mfapi]: { listQuotes: Mfapi.listQuotes, source: PriceSource.Mfapi },
	[Feed.Yahoo]: { listQuotes: Yahoo.listQuotes, source: PriceSource.Yahoo },
};

type FetchQuotesOptions = { symbolId: string };

/** Saves a feed symbol's quotes from its latest one on, and how the fetch went; a symbol since removed is left alone. */
export const fetchQuotes = ({ symbolId }: FetchQuotesOptions): ResultAsync<void> =>
	DB.findSymbol(symbolId).andThen((s) => {
		const feed = s && FEEDS[s.feed];
		if (!s || !feed) return okAsync();

		return withContext('fetch')((fetch) =>
			DB.findLatestQuote(s.id)
				.andThen((d) => feed.listQuotes(fetch, s.symbol, d))
				.andThen((q) => DB.saveQuotes(s.id, feed.source, q))
				.andThen(() => DB.saveFetch(s.id, null))
				.orElse((e) =>
					DB.saveFetch(s.id, e)
						.andThen(() => errAsync(e))
						.mapErr(() => e),
				),
		);
	});
