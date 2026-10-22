import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';
import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import * as Mfapi from '#services/ledger/adapters/feed-mfapi.ts';
import * as Yahoo from '#services/ledger/adapters/feed-yahoo.ts';
import { Feed } from '#services/ledger/domain/types.ts';
import { describe, expect, it, vi } from 'vitest';

const answering = (body: unknown, status = 200) =>
	vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { status }));

const quote = (date: string, amount: string, commodity: string) => ({
	date: Temporal.PlainDate.from(date),
	price: { amount: parseAmount(amount) as Amount, commodity },
});

const scheme = (data: { date: string; nav: string }[], code = 120716) => ({
	meta: { scheme_code: code, scheme_name: 'UTI Nifty 50 Index Fund' },
	data,
	status: 'SUCCESS',
});

const chart = (currency: string, timestamp: number[], close: (number | null)[]) => ({
	chart: {
		result: [
			{
				meta: { currency, exchangeTimezoneName: 'Asia/Kolkata', priceHint: 2 },
				timestamp,
				indicators: { quote: [{ close }] },
			},
		],
		error: null,
	},
});

/** 09:15 in Mumbai, when NSE opens. */
const OPENS = { oct16: 1760586300, oct17: 1760672700 };

describe('mfapi', () => {
	it('reads a scheme’s NAVs in rupees, oldest first', async () => {
		const fetch = answering(
			scheme([
				{ date: '17-10-2025', nav: '160.65250' },
				{ date: '16-10-2025', nav: 'N.A.' },
				{ date: '15-10-2025', nav: '159.31000' },
			]),
		);

		expect(await Mfapi.listQuotes(fetch, '120716', null)).toEqual(
			ok([quote('2025-10-15', '159.31', 'INR'), quote('2025-10-17', '160.6525', 'INR')]),
		);
		expect(fetch).toHaveBeenCalledWith('https://api.mfapi.in/mf/120716', expect.anything());
	});

	it('asks only from a day on, once it has quotes', async () => {
		const fetch = answering(scheme([]));
		await Mfapi.listQuotes(fetch, '120716', Temporal.PlainDate.from('2025-10-15'));

		expect(fetch).toHaveBeenCalledWith(
			'https://api.mfapi.in/mf/120716?startDate=2025-10-15',
			expect.anything(),
		);
	});

	it('knows a scheme it does not have by its empty answer', async () => {
		const fetch = answering(scheme([], 0));

		expect(await Mfapi.listQuotes(fetch, '999', null)).toEqual(
			err(fault('FeedSymbolUnknown', { feed: Feed.Mfapi, symbol: '999' })),
		);
	});
});

describe('yahoo', () => {
	it('dates each close where its exchange is, at the precision it quotes', async () => {
		const fetch = answering(
			chart('INR', [OPENS.oct16, OPENS.oct17], [1441.0999755859375, 1460.9000244140625]),
		);

		expect(await Yahoo.listQuotes(fetch, 'INFY.NS', null)).toEqual(
			ok([quote('2025-10-16', '1441.10', 'INR'), quote('2025-10-17', '1460.90', 'INR')]),
		);
	});

	it('leaves out a day without a close', async () => {
		const fetch = answering(chart('INR', [OPENS.oct16, OPENS.oct17], [null, 1460.9]));

		expect(await Yahoo.listQuotes(fetch, 'INFY.NS', null)).toEqual(
			ok([quote('2025-10-17', '1460.90', 'INR')]),
		);
	});

	it('quotes pence as pounds, so every price is in an ISO currency', async () => {
		const fetch = answering(chart('GBp', [OPENS.oct16], [185.4]));

		expect(await Yahoo.listQuotes(fetch, 'BARC.L', null)).toEqual(
			ok([quote('2025-10-16', '1.854', 'GBP')]),
		);
	});

	it('refuses a currency it cannot name in ISO', async () => {
		const fetch = answering(chart('Rs', [OPENS.oct16], [1]));

		expect(await Yahoo.listQuotes(fetch, 'INFY.NS', null)).toEqual(
			err(
				fault('FeedInvalidResponse', {
					feed: Feed.Yahoo,
					symbol: 'INFY.NS',
					reason: 'currency Rs',
				}),
			),
		);
	});

	it('asks like a browser, from the start or from a day on', async () => {
		const fetch = answering(chart('INR', [], []));
		await Yahoo.listQuotes(fetch, 'INFY.NS', null);
		await Yahoo.listQuotes(fetch, 'INFY.NS', Temporal.PlainDate.from('2025-10-16'));

		const asked = fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('period1'));
		expect(asked).toEqual(['0', '1760572800']);
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining('/v8/finance/chart/INFY.NS?'),
			expect.objectContaining({ headers: { 'user-agent': 'Mozilla/5.0' } }),
		);
	});
});

describe('asking a feed', () => {
	const asked = { feed: Feed.Yahoo, symbol: 'INFY.NS' };
	const listed = (fetch: typeof globalThis.fetch) => Yahoo.listQuotes(fetch, 'INFY.NS', null);

	it('knows a symbol it does not have by its 404', async () => {
		const fetch = answering({ chart: { result: null, error: { code: 'Not Found' } } }, 404);

		expect(await listed(fetch)).toEqual(err(fault('FeedSymbolUnknown', asked)));
	});

	it.each([429, 503])('finds a feed answering %i unavailable, to ask again later', async (s) => {
		expect(await listed(answering({}, s))).toEqual(
			err(fault('FeedUnavailable', { ...asked, status: s })),
		);
	});

	it('finds a feed it cannot reach unavailable', async () => {
		const fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed')));

		expect(await listed(fetch)).toEqual(err(fault('FeedUnavailable', asked)));
	});

	it('refuses an answer it cannot read', async () => {
		const html = vi.fn(async () => new Response('<html>', { status: 200 }));

		expect(await listed(answering({}, 400))).toEqual(
			err(fault('FeedInvalidResponse', { ...asked, reason: 'status 400' })),
		);
		expect(await listed(html)).toEqual(
			err(fault('FeedInvalidResponse', { ...asked, reason: 'not JSON' })),
		);
		expect((await listed(answering({ chart: {} })))._unsafeUnwrapErr()).toMatchObject({
			type: 'FeedInvalidResponse',
			...asked,
		});
	});
});
