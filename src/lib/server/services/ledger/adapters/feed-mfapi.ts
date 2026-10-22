import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync } from '#lib/server/shared/result/result.ts';
import * as v from 'valibot';
import { DEFAULT_COMMODITY, parseAmount } from '../domain/amounts';
import { Feed } from '../domain/types';
import { readJson, type ListQuotes, type Quote } from './feed';

/** https://www.mfapi.in documents the scheme endpoint and its startDate. */
const URL = 'https://api.mfapi.in/mf';

const History = v.object({
	meta: v.object({ scheme_code: v.number() }),
	data: v.array(
		v.object({ date: v.pipe(v.string(), v.regex(/^\d{2}-\d{2}-\d{4}$/)), nav: v.string() }),
	),
});

/** A scheme's NAVs in rupees. mfapi answers a scheme it does not know with an empty scheme 0. */
export const listQuotes: ListQuotes = (fetch, symbol, since) =>
	readJson(fetch, { feed: Feed.Mfapi, symbol, url: urlOf(symbol, since), schema: History }).andThen(
		(h) =>
			h.meta.scheme_code === 0
				? errAsync(fault('FeedSymbolUnknown', { feed: Feed.Mfapi, symbol }))
				: okAsync(h.data.flatMap(toQuote).toReversed()),
	);

const urlOf = (s: string, d: Temporal.PlainDate | null) =>
	`${URL}/${encodeURIComponent(s)}${d ? `?startDate=${d.toString()}` : ''}`;

const toQuote = (row: { date: string; nav: string }): Quote[] => {
	const [day, month, year] = row.date.split('-').map(Number);
	const amount = parseAmount(row.nav);
	if (!amount) return [];
	return [
		{
			date: Temporal.PlainDate.from({ year: year ?? 0, month: month ?? 0, day: day ?? 0 }),
			price: { amount, commodity: DEFAULT_COMMODITY },
		},
	];
};
