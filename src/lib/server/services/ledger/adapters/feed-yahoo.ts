import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync } from '#lib/server/shared/result/result.ts';
import * as v from 'valibot';
import { parseAmount } from '../domain/amounts';
import { Feed } from '../domain/types';
import { readJson, type ListQuotes, type Quote } from './feed';

/** Yahoo's chart endpoint is undocumented; it turns away requests without a browser's user agent. */
const URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const HEADERS = { 'user-agent': 'Mozilla/5.0' };

/** Currencies Yahoo quotes in their hundredth, and the ISO currency they are a hundredth of. */
const HUNDREDTHS: Record<string, string> = {
	GBp: 'GBP',
	GBX: 'GBP',
	ZAc: 'ZAR',
	ILA: 'ILS',
	USX: 'USD',
};

const Series = v.object({
	meta: v.object({
		currency: v.string(),
		exchangeTimezoneName: v.string(),
		priceHint: v.optional(v.number(), 2),
	}),
	timestamp: v.optional(v.array(v.number()), []),
	indicators: v.object({
		quote: v.tuple([v.object({ close: v.optional(v.array(v.nullable(v.number())), []) })]),
	}),
});
const Chart = v.object({ chart: v.object({ result: v.tuple([Series]) }) });

/** Each trading day's close, dated where the exchange is; a day without one is left out. */
export const listQuotes: ListQuotes = (fetch, symbol, since) =>
	readJson(fetch, {
		feed: Feed.Yahoo,
		symbol,
		url: urlOf(symbol, since),
		headers: HEADERS,
		schema: Chart,
	}).andThen((c) => quotesOf(symbol, c.chart.result[0]));

const urlOf = (symbol: string, since: Temporal.PlainDate | null) => {
	const from = since ? since.toZonedDateTime('UTC').epochMilliseconds / 1000 : 0;
	const to = Math.floor(Date.now() / 1000);
	return `${URL}/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`;
};

const quotesOf = (symbol: string, series: v.InferOutput<typeof Series>) => {
	const meta = series.meta;
	const hundredths = HUNDREDTHS[meta.currency];
	const currency = hundredths ?? meta.currency;
	if (!/^[A-Z]{3}$/.test(currency))
		return errAsync(
			fault('FeedInvalidResponse', {
				feed: Feed.Yahoo,
				symbol,
				reason: `currency ${meta.currency}`,
			}),
		);

	const closes = series.indicators.quote[0].close;
	const digits = meta.priceHint + (hundredths ? 2 : 0);
	const quotes = series.timestamp.flatMap((t, i): Quote[] => {
		const close = closes[i];
		const amount = close ? parseAmount((hundredths ? close / 100 : close).toFixed(digits)) : null;
		if (!amount) return [];

		const date = Temporal.Instant.fromEpochMilliseconds(t * 1000)
			.toZonedDateTimeISO(meta.exchangeTimezoneName)
			.toPlainDate();
		return [{ date, price: { amount, commodity: currency } }];
	});
	return okAsync(quotes);
};
