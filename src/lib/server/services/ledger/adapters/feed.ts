import { fault } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as v from 'valibot';
import type { Quantity } from '../domain/amounts';
import type { Feed } from '../domain/types';

const TIMEOUT = 60_000;

export type Fetch = typeof globalThis.fetch;

/** A symbol's closing price on a day, in an ISO currency. */
export type Quote = { date: Temporal.PlainDate; price: Quantity };

/** A feed's quotes of a symbol, oldest first: from a day on, or all of them when since is null. */
export type ListQuotes = (
	fetch: Fetch,
	symbol: string,
	since: Temporal.PlainDate | null,
) => ResultAsync<Quote[]>;

type ReadJsonOptions<T> = {
	feed: Feed;
	symbol: string;
	url: string;
	headers?: Record<string, string>;
	schema: v.GenericSchema<unknown, T>;
};

/** A feed that is down or busy is worth asking again later; an answer it cannot give is not. */
export const readJson = <T>(fetch: Fetch, o: ReadJsonOptions<T>): ResultAsync<T> => {
	const asked = { feed: o.feed, symbol: o.symbol };
	const invalid = (r: string) => fault('FeedInvalidResponse', { ...asked, reason: r });
	const request = { headers: o.headers ?? {}, signal: AbortSignal.timeout(TIMEOUT) };

	return attempt(
		() => fetch(o.url, request),
		() => fault('FeedUnavailable', asked),
	)
		.andThen((r) => checkStatus(asked, r))
		.andThen((r) =>
			attempt(
				() => r.json(),
				() => invalid('not JSON'),
			),
		)
		.andThen((body) => {
			const parsed = v.safeParse(o.schema, body);
			return parsed.success
				? okAsync(parsed.output)
				: errAsync(invalid(v.summarize(parsed.issues)));
		});
};

const checkStatus = (asked: { feed: Feed; symbol: string }, r: Response): ResultAsync<Response> => {
	if (r.status === 404) return errAsync(fault('FeedSymbolUnknown', asked));
	if (r.status === 429 || r.status >= 500)
		return errAsync(fault('FeedUnavailable', { ...asked, status: r.status }));
	if (!r.ok)
		return errAsync(fault('FeedInvalidResponse', { ...asked, reason: `status ${r.status}` }));
	return okAsync(r);
};
