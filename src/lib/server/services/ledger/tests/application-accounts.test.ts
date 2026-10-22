import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import * as DB from '#services/ledger/adapters/database.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { Feed, PriceSource } from '#services/ledger/domain/types.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';

const bought = (price: number) =>
	[
		'2026-10-01 Buy',
		'\tAssets:Zerodha 1 INFY @ 1500',
		'\tAssets:Bank',
		'',
		`P 2026-10-02 INFY ${price}`,
		'',
	].join('\n');

describe('accounts', () => {
	const day = Temporal.PlainDate.from('2026-10-17');

	it('values what each account holds at its latest price, a P line first', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-02 Buy',
				'\tAssets:Zerodha 10 INFY @ 1500',
				'\tAssets:Bank',
				'',
				'2026-03-01 Sell',
				'\tAssets:Zerodha -4 INFY {1500} @ 1700',
				'\tAssets:Bank 6800',
				'\tIncome:Gains -800',
				'',
				'2026-04-01 Bonus',
				'\tAssets:Zerodha 1 TCS',
				'\tIncome:Bonus -1 TCS',
				'',
				'2026-10-01 Buy',
				'\tAssets:Zerodha 1 INFY @ 1900',
				'\tAssets:Bank',
				'',
				'P 2026-10-01 INFY 1800',
				'P 2026-10-20 INFY 2000',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap().succeeded;
			expect(accounts.map((a) => [a.account, a.total, a.cost, a.gain, a.unpriced])).toEqual([
				['Assets', 2500_0000000000n, 10900_0000000000n, 1700_0000000000n, 1],
				['Assets:Bank', -10100_0000000000n, null, null, 0],
				['Assets:Zerodha', 12600_0000000000n, 10900_0000000000n, 1700_0000000000n, 1],
			]);
			expect(accounts[2]?.holdings).toMatchObject([
				{
					commodity: 'INFY',
					units: 7_0000000000n,
					cost: { amount: 10900_0000000000n, commodity: 'INR' },
					price: { amount: 1800_0000000000n, commodity: 'INR' },
					gain: 1700_0000000000n,
				},
				{ commodity: 'TCS', units: 1_0000000000n, value: null },
			]);
		}));

	it('sums only the files that remain, as they are edited and deleted', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const bank = async () =>
				(await Accounts.listAccounts({ ledger, day }))
					._unsafeUnwrap()
					.succeeded.find((a) => a.account === 'Assets:Bank')?.total;
			const file = (amount: number) =>
				['2026-10-01 Salary', `\tAssets:Bank ${amount}`, '\tIncome:Salary', ''].join('\n');
			const created = await Files.createFile({ ledger, key: 'a.rupee', content: file(100) });
			await Files.createFile({ ledger, key: 'b.rupee', content: file(10) });
			expect(await bank()).toBe(110_0000000000n);

			await Files.editFile({
				ledger,
				key: 'a.rupee',
				content: file(200),
				version: created._unsafeUnwrap().version,
			});
			expect(await bank()).toBe(210_0000000000n);

			await Files.deleteFiles({ ledger, keys: ['a.rupee'] });
			expect(await bank()).toBe(10_0000000000n);
		}));

	it('values shares priced in dollars at the price of a dollar', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-10-01 Fund',
				'\tAssets:IBKR 1000 USD @ 83',
				'\tAssets:HDFC',
				'',
				'2026-10-02 Buy',
				'\tAssets:IBKR 2 AAPL @ 200 USD',
				'\tAssets:IBKR -400 USD',
				'',
				'P 2026-10-03 AAPL 250 USD',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'ibkr.rupee', content });

			const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap().succeeded;
			expect(accounts.find((a) => a.account === 'Assets:IBKR')?.holdings).toMatchObject([
				{ commodity: 'AAPL', value: 41500_0000000000n, gain: 8300_0000000000n },
				{ commodity: 'USD', value: 49800_0000000000n, gain: null },
			]);
		}));

	it('values each ledger at its own prices of a commodity both hold', ({ context, db }) =>
		provide(context, async () => {
			const values = await Promise.all(
				[1600, 2000].map(async (price) => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupee', content: bought(price) });

					const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap();
					return accounts.succeeded.find((a) => a.account === 'Assets:Zerodha')?.holdings[0]?.value;
				}),
			);

			expect(values).toEqual([1600_0000000000n, 2000_0000000000n]);
		}));

	it('lists the lots an account held, with what each disposal realised', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-02 Buy',
				'\tAssets:Zerodha 10 INFY @ 1500',
				'\tAssets:Bank',
				'',
				'2026-03-01 Sell',
				'\tAssets:Zerodha -4 INFY {1500} @ 1700',
				'\tAssets:Bank 6800',
				'\tIncome:Gains -800',
				'',
				'2026-04-01 Move',
				'\tAssets:Zerodha -6 INFY',
				'\tAssets:Groww 6 INFY',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const zerodha = (
				await Accounts.listLots({ ledger, account: 'Assets:Zerodha', commodity: 'INFY' })
			)._unsafeUnwrap();
			expect(zerodha.succeeded).toMatchObject([
				{
					location: { file: 'a.rupee', line: 1 },
					origin: 'buy',
					remaining: 0n,
					disposals: [
						{
							kind: 'sale',
							units: -4_0000000000n,
							gain: { amount: 800_0000000000n, commodity: 'INR' },
						},
						{ kind: 'transfer', units: -6_0000000000n, price: null, gain: null },
					],
				},
			]);

			const groww = (
				await Accounts.listLots({ ledger, account: 'Assets:Groww', commodity: 'INFY' })
			)._unsafeUnwrap();
			expect(groww.succeeded).toMatchObject([
				{ origin: 'transfer', from: 'Assets:Zerodha', remaining: 6_0000000000n, disposals: [] },
			]);
		}));
});

describe('evidence', () => {
	const day = Temporal.PlainDate.from('2026-10-03');
	const salary = (role: string) =>
		[
			'2026-10-02 Salary',
			`\t- ${role}: october-salary`,
			'\tAssets:Bank 500',
			'\tIncome:Salary',
			'',
		].join('\n');

	it('counts an event once in what accounts hold and what they are worth', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'payslip.rupee', content: salary('event') });
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: salary('same-as') });

			const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap().succeeded;
			const worth = (await Accounts.listWorth({ ledger, from: day, to: day }))._unsafeUnwrap();
			expect(accounts.map((a) => [a.account, a.total])).toEqual([
				['Assets', 500_0000000000n],
				['Assets:Bank', 500_0000000000n],
			]);
			expect(worth.succeeded.map((w) => w.worth)).toEqual([500_0000000000n]);
		}));
});

describe('net worth', () => {
	const from = Temporal.PlainDate.from('2026-10-01');
	const to = Temporal.PlainDate.from('2026-10-03');

	it('values each day at the prices known by then, owing liabilities', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-05 Salary',
				'\tAssets:Bank 100000',
				'\tIncome:Salary',
				'',
				'2026-02-01 Dinner',
				'\tExpenses:Food 2000',
				'\tLiabilities:Card',
				'',
				'2026-10-01 Fund',
				'\tAssets:IBKR 100 USD @ 83',
				'\tAssets:Bank',
				'',
				'2026-10-02 Buy',
				'\tAssets:IBKR 2 AAPL @ 40 USD',
				'\tAssets:IBKR -80 USD',
				'',
				'2026-10-02 Bonus',
				'\tAssets:Zerodha 1 TCS',
				'\tIncome:Bonus -1 TCS',
				'',
				'P 2026-10-03 AAPL 50 USD',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const worth = (await Accounts.listWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;
			const days = worth.map((w) => [
				w.day.toString(),
				w.assets,
				w.liabilities,
				w.worth,
				w.unpriced,
			]);
			expect(days).toEqual([
				['2026-10-01', 100000_0000000000n, 2000_0000000000n, 98000_0000000000n, 0],
				['2026-10-02', 100000_0000000000n, 2000_0000000000n, 98000_0000000000n, 1],
				['2026-10-03', 101660_0000000000n, 2000_0000000000n, 99660_0000000000n, 1],
			]);
		}));

	it('values each ledger at its own prices of a commodity both hold', ({ context, db }) =>
		provide(context, async () => {
			const worths = await Promise.all(
				[1600, 2000].map(async (price) => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupee', content: bought(price) });

					const worth = (await Accounts.listWorth({ ledger, from, to }))._unsafeUnwrap();
					return worth.succeeded.at(-1)?.worth;
				}),
			);

			expect(worths).toEqual([100_0000000000n, 500_0000000000n]);
		}));

	it('starts on the first day the ledger has, and is empty without one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const empty = (await Accounts.listWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;
			const content = ['2026-10-02 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const worth = (await Accounts.listWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;
			expect(empty).toEqual([]);
			expect(worth.map((w) => w.day.toString())).toEqual(['2026-10-02', '2026-10-03']);
		}));
});

describe('linked feeds', () => {
	const day = Temporal.PlainDate.from('2026-10-17');
	const held = (link: string, ...more: string[]) =>
		['2026-10-01 Buy', '\tAssets:Kuvera 1 HNFI @ 100', '\tAssets:Bank', '', link, ...more, ''].join(
			'\n',
		);

	/** Saves a feed's quotes as a fetch would, for a symbol a ledger already links. */
	const quoted = async (db: Database, feed: Feed, symbol: string, q: Record<string, string>) => {
		const found = await db
			.selectFrom('symbols')
			.select('id')
			.where('feed', '=', feed)
			.where('symbol', '=', symbol)
			.executeTakeFirst();
		const source = feed === Feed.Mfapi ? PriceSource.Mfapi : PriceSource.Yahoo;
		const quotes = Object.entries(q).map(([date, price]) => {
			const [amount = '', commodity = 'INR'] = price.split(' ');
			const parsed = parseAmount(amount) as Amount;
			return { date: Temporal.PlainDate.from(date), price: { amount: parsed, commodity } };
		});
		await DB.saveQuotes(found?.id ?? '', source, quotes);
	};

	const valueOf = async (ledger: Ledger, account = 'Assets:Kuvera') =>
		(await Accounts.listAccounts({ ledger, day }))
			._unsafeUnwrap()
			.succeeded.find((a) => a.account === account)?.holdings[0]?.value;

	it('values at a feed’s quote, a P line first on its day, and a later quote over both', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = held('P * HNFI yahoo:RANK.NS', 'P 2026-10-10 HNFI 120');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			await quoted(db, Feed.Yahoo, 'RANK.NS', { '2026-10-05': '105', '2026-10-10': '110' });
			const sameDay = await valueOf(ledger);
			await quoted(db, Feed.Yahoo, 'RANK.NS', { '2026-10-12': '125' });
			const later = await valueOf(ledger);

			expect([sameDay, later]).toEqual([120_0000000000n, 125_0000000000n]);
		}));

	it('switches feed on the day a link names, each feed counting only while linked', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = held('P * HNFI mfapi:200001', 'P 2026-10-10 HNFI yahoo:SWITCH.NS');
			await Files.createFile({ ledger, key: 'a.rupee', content });
			await quoted(db, Feed.Mfapi, '200001', { '2026-10-05': '105', '2026-10-12': '999' });
			await quoted(db, Feed.Yahoo, 'SWITCH.NS', { '2026-10-08': '888', '2026-10-11': '111' });

			const from = Temporal.PlainDate.from('2026-10-09');
			const to = Temporal.PlainDate.from('2026-10-12');
			const worth = (await Accounts.listWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;

			expect(worth.map((w) => [w.day.toString(), w.worth])).toEqual([
				['2026-10-09', 5_0000000000n],
				['2026-10-10', 5_0000000000n],
				['2026-10-11', 11_0000000000n],
				['2026-10-12', 11_0000000000n],
			]);
		}));

	it('prices by the later of two links from one day, which the check warns of', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = held('P * HNFI mfapi:200002', 'P * HNFI yahoo:LATER.NS');
			await Files.createFile({ ledger, key: 'a.rupee', content });
			await quoted(db, Feed.Mfapi, '200002', { '2026-10-12': '999' });
			await quoted(db, Feed.Yahoo, 'LATER.NS', { '2026-10-10': '150' });

			expect(await valueOf(ledger)).toBe(150_0000000000n);
		}));

	it('reaches rupees through a dollar quoted by a feed too', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-10-01 Fund',
				'\tAssets:IBKR 400 USD @ 80',
				'\tAssets:HDFC',
				'',
				'2026-10-02 Buy',
				'\tAssets:IBKR 2 AAPL @ 200 USD',
				'\tAssets:IBKR -400 USD',
				'',
				'P * AAPL yahoo:AAPL',
				'P * USD yahoo:USDINR=X',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'ibkr.rupee', content });
			await quoted(db, Feed.Yahoo, 'AAPL', { '2026-10-10': '250 USD' });
			await quoted(db, Feed.Yahoo, 'USDINR=X', { '2026-10-10': '83' });

			const worth = await Accounts.listWorth({ ledger, from: day, to: day });
			expect(await valueOf(ledger, 'Assets:IBKR')).toBe(41500_0000000000n);
			expect(worth._unsafeUnwrap().succeeded.map((w) => w.worth)).toEqual([9500_0000000000n]);
		}));

	it('prices by its own links only, though ledgers share a feed’s quotes', ({ context, db }) =>
		provide(context, async () => {
			const linked = await createLedger(db);
			const unlinked = await createLedger(db);
			await Files.createFile({
				ledger: linked,
				key: 'a.rupee',
				content: held('P * HNFI yahoo:OWN.NS'),
			});
			await Files.createFile({ ledger: unlinked, key: 'a.rupee', content: held('') });
			await quoted(db, Feed.Yahoo, 'OWN.NS', { '2026-10-10': '150' });

			expect(await valueOf(linked)).toBe(150_0000000000n);
			expect(await valueOf(unlinked)).toBe(100_0000000000n);
		}));
});

describe('spending', () => {
	const span = (from: string, to: string) => ({
		from: Temporal.PlainDate.from(from),
		to: Temporal.PlainDate.from(to),
	});
	const content = [
		'2026-01-10 Groceries',
		'\tExpenses:Food:Groceries 1000',
		'\tAssets:Bank',
		'',
		'2026-01-20 Refund',
		'\tExpenses:Food:Groceries -200',
		'\tAssets:Bank',
		'',
		'2026-02-05 Hotel',
		'\tExpenses:Travel 100 USD',
		'\tLiabilities:Card',
		'',
		'2026-02-06 Souvenir',
		'\tExpenses:Travel 5 EUR',
		'\tLiabilities:Card',
		'',
		'P 2026-02-01 USD 83',
		'P 2026-03-01 USD 90',
		'',
	].join('\n');
	const buckets = (spending: Accounts.Spending | undefined) =>
		spending?.spent.map((s) => [s.account, s.bucket.toString(), s.amount, s.unpriced]);
	const totals = (spending: Accounts.Spending | undefined) =>
		spending?.totals.map((t) => [t.account, t.amount, t.unpriced]);

	it('adds up each account and its parents by bucket, net of refunds, at its own day’s price', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2026-01-01', '2026-12-31')],
				bucket: 'month',
			});
			const [year] = spending._unsafeUnwrap().succeeded;
			expect(buckets(year)).toEqual([
				['Expenses', '2026-01-01', 800_0000000000n, 0],
				['Expenses', '2026-02-01', 8300_0000000000n, 1],
				['Expenses:Food', '2026-01-01', 800_0000000000n, 0],
				['Expenses:Food:Groceries', '2026-01-01', 800_0000000000n, 0],
				['Expenses:Travel', '2026-02-01', 8300_0000000000n, 1],
			]);
			expect(year?.buckets.map(String)).toEqual([
				'2026-01-01',
				'2026-02-01',
				'2026-03-01',
				'2026-04-01',
				'2026-05-01',
				'2026-06-01',
				'2026-07-01',
				'2026-08-01',
				'2026-09-01',
				'2026-10-01',
				'2026-11-01',
				'2026-12-01',
			]);
			expect(totals(year)).toEqual([
				['Expenses', 9100_0000000000n, 1],
				['Expenses:Food', 800_0000000000n, 0],
				['Expenses:Food:Groceries', 800_0000000000n, 0],
				['Expenses:Travel', 8300_0000000000n, 1],
			]);
		}));

	it('reads each span on its own, by day or year', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const byDay = await Accounts.listSpending({
				ledger,
				spans: [span('2026-01-15', '2026-01-31'), span('2026-01-01', '2026-01-14')],
				bucket: 'day',
			});
			const byYear = await Accounts.listSpending({
				ledger,
				spans: [span('0001-01-01', '2026-12-31')],
				bucket: 'year',
			});
			const [later, earlier] = byDay._unsafeUnwrap().succeeded;
			expect(buckets(later)?.[0]).toEqual(['Expenses', '2026-01-20', -200_0000000000n, 0]);
			expect(buckets(earlier)?.[0]).toEqual(['Expenses', '2026-01-10', 1000_0000000000n, 0]);
			expect(byYear._unsafeUnwrap().succeeded[0]?.buckets.map(String)).toEqual(['2026-01-01']);
			expect(buckets(byYear._unsafeUnwrap().succeeded[0])?.[0]).toEqual([
				'Expenses',
				'2026-01-01',
				9100_0000000000n,
				1,
			]);
		}));

	it('keeps a range’s empty buckets, and starts all of history on the first day spent', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2025-11-15', '2026-01-31'), span('0001-01-01', '2026-12-31')],
				bucket: 'month',
			});
			const [range, all] = spending._unsafeUnwrap().succeeded;
			expect(range?.from.toString()).toBe('2025-11-15');
			expect(range?.buckets.map(String)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
			expect(all?.from.toString()).toBe('2026-01-10');
			expect(all?.buckets.map(String)).toHaveLength(12);
			expect(all?.buckets[0]?.toString()).toBe('2026-01-01');
		}));

	it('counts an event once', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const dinner = (role: string) => [
				'2026-10-02 Dinner',
				`\t- ${role}: dinner`,
				'\tExpenses:Food 500',
				'\tAssets:Bank',
				'',
			];
			await Files.createFile({ ledger, key: 'a.rupee', content: dinner('event').join('\n') });
			await Files.createFile({ ledger, key: 'b.rupee', content: dinner('same-as').join('\n') });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2026-10-01', '2026-10-31')],
				bucket: 'month',
			});
			expect(totals(spending._unsafeUnwrap().succeeded[0])).toEqual([
				['Expenses', 500_0000000000n, 0],
				['Expenses:Food', 500_0000000000n, 0],
			]);
		}));
});
