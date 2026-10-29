import type { Database } from '#lib/server/db/index.ts';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';
import { listJobs, runJob } from '#services/jobs/application/jobs.ts';
import { fetchQuotes } from '#services/ledger/adapters/jobs.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import * as Quotes from '#services/ledger/application/quotes.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { Feed } from '#services/ledger/domain/types.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, vi } from 'vitest';

const day = Temporal.PlainDate.from('2026-10-20');
/** Feed symbols outlive a ledger, so each test links a scheme of its own. */
const fund = (code: string) =>
	[
		'2026-10-01 Buy',
		'\tAssets:Kuvera 10 HNFI @ 150',
		'\tAssets:Bank',
		'',
		`P * HNFI mfapi:${code}`,
		'',
	].join('\n');

const scheme = (navs: Record<string, string>) =>
	new Response(
		JSON.stringify({
			meta: { scheme_code: 120716 },
			data: Object.entries(navs).map(([date, nav]) => ({ date, nav })),
		}),
	);

const navs = (n: Record<string, string>) => vi.fn<typeof globalThis.fetch>(async () => scheme(n));

const symbolOf = async (db: Database, code: string) =>
	(
		await db
			.selectFrom('symbols')
			.select('id')
			.where('feed', '=', Feed.Mfapi)
			.where('symbol', '=', code)
			.execute()
	).map((s) => s.id);

const queued = async (l: Ledger) =>
	(
		await listJobs({ userId: l.owner, name: fetchQuotes.name, payload: {}, limit: 10 })
	)._unsafeUnwrap();

const fetchedWith = (context: RupeaContext, fetch: typeof globalThis.fetch, symbolId: string) =>
	provide({ ...context, fetch }, () => Quotes.fetchQuotes({ symbolId }));

const valueOf = async (ledger: Ledger) =>
	(await Accounts.listAccounts({ ledger, day }))
		._unsafeUnwrap()
		.succeeded.find((a) => a.account === 'Assets:Kuvera')?.holdings[0]?.value;

describe('fetching quotes', () => {
	it('queues a fetch for a linked fund, and values the ledger at what it saves', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: fund('100001') });
			await Sync.syncIndex(ledger);
			const [symbolId = ''] = await symbolOf(db, '100001');
			const [job] = await queued(ledger);
			const fetch = navs({ '17-10-2026': '160.5', '16-10-2026': '161' });

			const ran = await provide({ ...context, fetch }, () =>
				runJob([fetchQuotes], {
					id: job?.id ?? '',
					userId: ledger.owner,
					name: fetchQuotes.name,
					version: fetchQuotes.version,
					payload: job?.payload,
					attempts: 1,
				}),
			);

			expect(job?.payload).toEqual({ symbol: symbolId });
			expect(ran).toEqual(ok());
			expect(await valueOf(ledger)).toBe(1605_0000000000n);
		}));

	it('asks only from its latest quote on, the next time', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: fund('100002') });
			const [symbolId = ''] = await symbolOf(db, '100002');
			const fetch = navs({ '17-10-2026': '160.5' });

			await fetchedWith(context, fetch, symbolId);
			await fetchedWith(context, fetch, symbolId);

			expect(fetch.mock.calls.map(([url]) => url)).toEqual([
				'https://api.mfapi.in/mf/100002',
				'https://api.mfapi.in/mf/100002?startDate=2026-10-17',
			]);
		}));

	it('records when fetches began failing, until one works', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: fund('100003') });
			const [symbolId = ''] = await symbolOf(db, '100003');
			const down = vi.fn(async () => new Response('', { status: 503 }));
			const health = () =>
				db
					.selectFrom('symbolFetches')
					.select(['fetchedAt', 'failingSince', 'error'])
					.where('symbolId', '=', symbolId)
					.executeTakeFirst();

			const failed = await fetchedWith(context, down, symbolId);
			const first = await health();
			await fetchedWith(context, down, symbolId);
			const second = await health();
			await fetchedWith(context, navs({ '17-10-2026': '160.5' }), symbolId);
			const recovered = await health();

			const unavailable = fault('FeedUnavailable', {
				feed: Feed.Mfapi,
				symbol: '100003',
				status: 503,
			});
			expect(failed).toEqual(err(unavailable));
			expect(first).toMatchObject({ fetchedAt: null, error: unavailable });
			expect(second?.failingSince).toEqual(first?.failingSince);
			expect(recovered).toMatchObject({ failingSince: null, error: null });
			expect(recovered?.fetchedAt).toBeInstanceOf(Date);
		}));

	it('fetches a symbol once for every ledger that links it', ({ context, db }) =>
		provide(context, async () => {
			const first = await createLedger(db);
			const second = await createLedger(db);
			await Files.createFile({ ledger: first, key: 'a.rupea', content: fund('100004') });
			await Sync.syncIndex(first);
			const [symbolId = ''] = await symbolOf(db, '100004');
			await fetchedWith(context, navs({ '17-10-2026': '160.5' }), symbolId);

			await Files.createFile({ ledger: second, key: 'a.rupea', content: fund('100004') });
			await Sync.syncIndex(second);

			expect(await symbolOf(db, '100004')).toEqual([symbolId]);
			expect(await queued(first)).toHaveLength(1);
			expect(await queued(second)).toEqual([]);
			expect(await valueOf(second)).toBe(1605_0000000000n);
		}));

	it('queues a symbol again after a fetch that failed for now, but not one the feed lacks', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = `${fund('100006')}P * NIFTY mfapi:100007\n`;
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const [down = ''] = await symbolOf(db, '100006');
			const [missing = ''] = await symbolOf(db, '100007');
			await fetchedWith(
				context,
				vi.fn(async () => new Response('', { status: 503 })),
				down,
			);
			await fetchedWith(
				context,
				vi.fn(async () => new Response('', { status: 404 })),
				missing,
			);

			await db.deleteFrom('jobs').where('userId', '=', ledger.owner).execute();
			await Sync.syncIndex(ledger);

			expect((await queued(ledger)).map((j) => j.payload)).toEqual([{ symbol: down }]);
		}));

	it('saves one quote a day when a feed answers for a day twice', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = fund('100008').replace('mfapi:100008', 'yahoo:TWICE.NS');
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const symbol = await db
				.selectFrom('symbols')
				.select('id')
				.where('symbol', '=', 'TWICE.NS')
				.executeTakeFirst();
			/** 09:15 on 17 October in Mumbai, when NSE opens. */
			const opens = 1792208700;
			const chart = {
				chart: {
					result: [
						{
							meta: { currency: 'INR', exchangeTimezoneName: 'Asia/Kolkata', priceHint: 2 },
							timestamp: [opens, opens + 3600],
							indicators: { quote: [{ close: [160, 161] }] },
						},
					],
				},
			};
			const fetch = vi.fn(async () => new Response(JSON.stringify(chart)));

			expect(await fetchedWith(context, fetch, symbol?.id ?? '')).toEqual(ok());
			expect(await valueOf(ledger)).toBe(1610_0000000000n);
		}));

	it('fails with the feed’s error even when recording it fails too', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: fund('100009') });
			const [symbolId = ''] = await symbolOf(db, '100009');
			const removing = vi.fn(async () => {
				await db.deleteFrom('symbols').where('id', '=', symbolId).execute();
				return new Response('', { status: 404 });
			});

			expect(await fetchedWith(context, removing, symbolId)).toEqual(
				err(fault('FeedSymbolUnknown', { feed: Feed.Mfapi, symbol: '100009' })),
			);
		}));

	it('leaves alone a symbol since removed, and one a ledger prices itself', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: fund('100005') });
			const own = await db
				.selectFrom('symbols')
				.select('id')
				.where('ledgerId', '=', ledger.id)
				.executeTakeFirst();
			const fetch = navs({});

			expect(await fetchedWith(context, fetch, uuidv7())).toEqual(ok());
			expect(await fetchedWith(context, fetch, own?.id ?? '')).toEqual(ok());
			expect(fetch).not.toHaveBeenCalled();
		}));
});
