import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import * as DB from '#services/ledger/adapters/database.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { AMOUNT_UNIT, parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { Feed, PriceSource } from '#services/ledger/domain/types.ts';
import { BEGINNING } from '#lib/shared/dates.ts';
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
			await Files.createFile({ ledger, key: 'a.rupea', content });

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

	it('holds what was there at the end of an earlier day, at the cost of the lots open then', ({
		context,
		db,
	}) =>
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
				'2026-03-20 Buy',
				'\tAssets:Zerodha 1 INFY @ 1600',
				'\tAssets:Bank',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const zerodha = async (on: string) => {
				const day = Temporal.PlainDate.from(on);
				const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap();
				const holding = accounts.succeeded.find((a) => a.account === 'Assets:Zerodha');
				return [holding?.holdings[0]?.units, holding?.cost];
			};
			expect(await zerodha('2026-01-01')).toEqual([undefined, undefined]);
			expect(await zerodha('2026-02-28')).toEqual([10_0000000000n, 15000_0000000000n]);
			expect(await zerodha('2026-03-01')).toEqual([6_0000000000n, 9000_0000000000n]);
			expect(await zerodha('2026-03-20')).toEqual([7_0000000000n, 10600_0000000000n]);
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
			const created = await Files.createFile({ ledger, key: 'a.rupea', content: file(100) });
			await Files.createFile({ ledger, key: 'b.rupea', content: file(10) });
			expect(await bank()).toBe(110_0000000000n);

			await Files.editFile({
				ledger,
				key: 'a.rupea',
				content: file(200),
				version: created._unsafeUnwrap().version,
			});
			expect(await bank()).toBe(210_0000000000n);

			await Files.deleteFiles({ ledger, keys: ['a.rupea'] });
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
			await Files.createFile({ ledger, key: 'ibkr.rupea', content });

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
					await Files.createFile({ ledger, key: 'a.rupea', content: bought(price) });

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
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const zerodha = (
				await Accounts.listLots({ ledger, account: 'Assets:Zerodha', commodity: 'INFY' })
			)._unsafeUnwrap();
			expect(zerodha.succeeded).toMatchObject([
				{
					location: { file: 'a.rupea', line: 1 },
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

	it('counts a group once in what accounts hold and what they are worth', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'payslip.rupea', content: salary('group') });
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: salary('same-as') });

			const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap().succeeded;
			const worth = (
				await Accounts.listWorth({ ledger, from: day, to: day, account: null })
			)._unsafeUnwrap();
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
	const partsOf = (worth: DB.Worth | undefined) =>
		worth?.parts.map((p) => `${p.commodity ?? p.account} ${p.amount / AMOUNT_UNIT}`).toSorted();

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
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const worth = (await Accounts.listWorth({ ledger, from, to, account: null }))._unsafeUnwrap()
				.succeeded;
			const days = worth.map((w) => [
				w.day.toString(),
				w.assets,
				w.liabilities,
				w.worth,
				w.unpriced,
			]);
			expect(days).toEqual([
				['2026-10-01', 100000_0000000000n, -2000_0000000000n, 98000_0000000000n, 0],
				['2026-10-02', 100000_0000000000n, -2000_0000000000n, 98000_0000000000n, 1],
				['2026-10-03', 101660_0000000000n, -2000_0000000000n, 99660_0000000000n, 1],
			]);
		}));

	it('values each ledger at its own prices of a commodity both hold', ({ context, db }) =>
		provide(context, async () => {
			const worths = await Promise.all(
				[1600, 2000].map(async (price) => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupea', content: bought(price) });

					const worth = (
						await Accounts.listWorth({ ledger, from, to, account: null })
					)._unsafeUnwrap();
					return worth.succeeded.at(-1)?.worth;
				}),
			);

			expect(worths).toEqual([100_0000000000n, 500_0000000000n]);
		}));

	it('starts on the first day the ledger has, and is empty without one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const empty = (await Accounts.listWorth({ ledger, from, to, account: null }))._unsafeUnwrap()
				.succeeded;
			const content = ['2026-10-02 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const worth = (await Accounts.listWorth({ ledger, from, to, account: null }))._unsafeUnwrap()
				.succeeded;
			expect(empty).toEqual([]);
			expect(worth.map((w) => w.day.toString())).toEqual(['2026-10-02', '2026-10-03']);
		}));

	it('narrows to an account and those under it, by the month and by the day', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets:Bank:Savings 100\n\tIncome:Salary\n',
				'2026-10-02 Withdraw\n\tAssets:Cash 30\n\tAssets:Bank:Savings\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const worth = async (account: string) => {
				const days = (await Accounts.listWorth({ ledger, from, to, account }))._unsafeUnwrap();
				return days.succeeded.map((w) => `${w.day} ${w.worth / AMOUNT_UNIT}`);
			};
			expect(await worth('assets:bank')).toEqual([
				'2026-10-01 100',
				'2026-10-02 70',
				'2026-10-03 70',
			]);
			expect(await worth('Assets:Cash')).toEqual(['2026-10-02 30', '2026-10-03 30']);
		}));

	it('splits each day at the first account under the one that divides, or its commodities without one', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets:Bank:Savings:HDFC 100\n\tAssets:Bank:Savings:SBI 10\n\tIncome:Salary\n',
				'2026-10-02 Dinner\n\tExpenses:Food 20\n\tLiabilities:Card\n',
				'2026-10-03 Withdraw\n\tAssets:Cash 30\n\tAssets:Bank:Savings:HDFC\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const parts = async (account: string | null) => {
				const days = (await Accounts.listWorth({ ledger, from, to, account }))._unsafeUnwrap()
					.succeeded;
				return partsOf(days.at(-1));
			};
			expect(await parts(null)).toEqual([
				'Assets:Bank:Savings 80',
				'Assets:Cash 30',
				'Liabilities:Card -20',
			]);
			expect(await parts('assets:bank')).toEqual([
				'Assets:Bank:Savings:HDFC 70',
				'Assets:Bank:Savings:SBI 10',
			]);
			expect(await parts('Assets:Bank:Savings:HDFC')).toEqual(['INR 70']);
		}));

	it('adds up the commodities a part holds into one amount', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets:Bank:HDFC 100\n\tIncome:Salary\n',
				'2026-08-21 Fund\n\tAssets:Bank:HDFC 1 USD @ 80\n\tAssets:Bank:HDFC -80\n',
				'2026-08-22 Bonus\n\tAssets:Bank:SBI 1 USD @ 80\n\tIncome:Bonus\n',
				'2026-08-23 Salary\n\tAssets:Cash 10\n\tIncome:Salary\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const parts = async (account: string | null) => {
				const days = (await Accounts.listWorth({ ledger, from, to, account }))._unsafeUnwrap()
					.succeeded;
				return partsOf(days.at(-1));
			};
			expect(await parts(null)).toEqual(['Assets:Bank 180', 'Assets:Cash 10']);
			expect(await parts('Assets:Bank:HDFC')).toEqual(['INR 20', 'USD 80']);
		}));

	it('keeps what top accounts hold themselves apart, by account', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets 100\n\tIncome:Salary\n',
				'2026-10-02 Dinner\n\tExpenses:Food 40\n\tLiabilities\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const days = (await Accounts.listWorth({ ledger, from, to, account: null }))._unsafeUnwrap()
				.succeeded;
			expect(partsOf(days.at(-1))).toEqual(['Assets 100', 'Liabilities -40']);
		}));

	it('splits an account written in two cases as one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets:Bank:Savings:HDFC 100\n\tIncome:Salary\n',
				'2026-08-21 Salary\n\tAssets:bank:savings:sbi 10\n\tIncome:Salary\n',
				'2026-08-22 Salary\n\tAssets:bank:savings:hdfc 5\n\tIncome:Salary\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const days = (
				await Accounts.listWorth({ ledger, from, to, account: 'Assets:Bank' })
			)._unsafeUnwrap().succeeded;
			expect(partsOf(days.at(-1))).toEqual([
				'Assets:Bank:Savings:HDFC 105',
				'Assets:bank:savings:sbi 10',
			]);
		}));

	it('opens with the months before and the days of its month before it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = ['2026-08-20', '2026-10-02', '2026-10-05']
				.map((d) => `${d} Salary\n\tAssets:Bank 100\n\tIncome:Salary\n`)
				.join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const worth = async (f: string, t: string) => {
				const span = { from: Temporal.PlainDate.from(f), to: Temporal.PlainDate.from(t) };
				const days = (await Accounts.listWorth({ ledger, ...span, account: null }))._unsafeUnwrap()
					.succeeded;
				return days.map((w) => `${w.day} ${w.worth / AMOUNT_UNIT}`);
			};
			expect(await worth('2026-10-04', '2026-10-05')).toEqual(['2026-10-04 200', '2026-10-05 300']);
			expect(await worth('2026-07-15', '2026-08-21')).toEqual(['2026-08-20 100', '2026-08-21 100']);
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
			await Files.createFile({ ledger, key: 'a.rupea', content });

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
			await Files.createFile({ ledger, key: 'a.rupea', content });
			await quoted(db, Feed.Mfapi, '200001', { '2026-10-05': '105', '2026-10-12': '999' });
			await quoted(db, Feed.Yahoo, 'SWITCH.NS', { '2026-10-08': '888', '2026-10-11': '111' });

			const from = Temporal.PlainDate.from('2026-10-09');
			const to = Temporal.PlainDate.from('2026-10-12');
			const worth = (await Accounts.listWorth({ ledger, from, to, account: null }))._unsafeUnwrap()
				.succeeded;

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
			await Files.createFile({ ledger, key: 'a.rupea', content });
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
			await Files.createFile({ ledger, key: 'ibkr.rupea', content });
			await quoted(db, Feed.Yahoo, 'AAPL', { '2026-10-10': '250 USD' });
			await quoted(db, Feed.Yahoo, 'USDINR=X', { '2026-10-10': '83' });

			const worth = await Accounts.listWorth({ ledger, from: day, to: day, account: null });
			expect(await valueOf(ledger, 'Assets:IBKR')).toBe(41500_0000000000n);
			expect(worth._unsafeUnwrap().succeeded.map((w) => w.worth)).toEqual([9500_0000000000n]);
		}));

	it('prices by its own links only, though ledgers share a feed’s quotes', ({ context, db }) =>
		provide(context, async () => {
			const linked = await createLedger(db);
			const unlinked = await createLedger(db);
			await Files.createFile({
				ledger: linked,
				key: 'a.rupea',
				content: held('P * HNFI yahoo:OWN.NS'),
			});
			await Files.createFile({ ledger: unlinked, key: 'a.rupea', content: held('') });
			await quoted(db, Feed.Yahoo, 'OWN.NS', { '2026-10-10': '150' });

			expect(await valueOf(linked)).toBe(150_0000000000n);
			expect(await valueOf(unlinked)).toBe(100_0000000000n);
		}));
});

describe('returns', () => {
	const year = {
		from: Temporal.PlainDate.from('2025-01-01'),
		to: Temporal.PlainDate.from('2025-12-31'),
	};
	const content = [
		'2024-12-01 Opening',
		'\tAssets:Bank 200000',
		'\tEquity:Opening',
		'',
		'2025-01-01 Buy',
		'\tAssets:Zerodha 100 INFY @ 1000',
		'\tAssets:Bank',
		'',
		'2025-03-01 Salary',
		'\tAssets:Bank 80000',
		'\tIncome:Salary',
		'',
		'2025-04-01 Lunch',
		'\tExpenses:Food 3000',
		'\tAssets:Bank',
		'',
		'2025-06-30 Interest',
		'\tAssets:Bank 1000',
		'\tIncome:Interest:Savings',
		'',
		'2025-07-01 Buy',
		'\tAssets:Zerodha 50 INFY @ 1000',
		'\tExpenses:Fees:Brokerage 20',
		'\tAssets:Bank',
		'',
		'2025-10-01 Dividend',
		'\tAssets:Zerodha 500',
		'\tIncome:Dividends:INFY',
		'',
		'P 2025-12-31 INFY 1100',
		'',
	].join('\n');
	const rows = (returns: Accounts.Returns[]) =>
		returns.map((r) => [r.account, r.netIn, r.yearly, r.unpriced]);

	it('weighs what flowed in and out against what each account held at both ends, counting interest, dividends and fees as earned', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const returns = (await Accounts.listReturns({ ledger, ...year }))._unsafeUnwrap();
			expect(rows(returns.succeeded)).toEqual([
				['Assets', 77000_0000000000n, true, 0],
				['Assets:Bank', -73020_0000000000n, true, 0],
				['Assets:Zerodha', 150020_0000000000n, true, 0],
			]);
			expect(returns.succeeded.map((r) => r.xirr)).toEqual([
				expect.closeTo(0.062358, 6),
				expect.closeTo(0.007153, 6),
				expect.closeTo(0.124785, 6),
			]);
			expect(returns.failed).toEqual([]);
		}));

	it('gives the return over a span shorter than a year, and starts all of history at nothing', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const month = (
				await Accounts.listReturns({
					ledger,
					from: Temporal.PlainDate.from('2025-12-01'),
					to: Temporal.PlainDate.from('2025-12-31'),
				})
			)._unsafeUnwrap().succeeded;
			const ever = (
				await Accounts.listReturns({
					ledger,
					from: Temporal.PlainDate.from(BEGINNING),
					to: year.to,
				})
			)._unsafeUnwrap().succeeded;
			expect(month.find((r) => r.account === 'Assets:Zerodha')).toEqual({
				account: 'Assets:Zerodha',
				netIn: 0n,
				xirr: expect.closeTo(0.099668, 6),
				yearly: false,
				unpriced: 0,
			});
			expect(ever.find((r) => r.account === 'Assets')).toMatchObject({
				netIn: 277000_0000000000n,
				yearly: true,
			});
		}));

	it('leaves out what has no price, naming only the deepest account it reaches', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const unpriced = ['2025-02-01 Bonus', '\tAssets:Zerodha 1 TCS', '\tIncome:Bonus', ''];
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: [content, ...unpriced].join('\n'),
			});

			const returns = (await Accounts.listReturns({ ledger, ...year }))._unsafeUnwrap();
			expect(returns.succeeded.map((r) => [r.account, r.xirr === null, r.unpriced])).toEqual([
				['Assets', true, 2],
				['Assets:Bank', false, 0],
				['Assets:Zerodha', true, 2],
			]);
			expect(returns.failed).toEqual([
				{ type: 'ReturnUnpriced', account: 'Assets:Zerodha', unpriced: 2 },
			]);
		}));

	it('names an account no rate solves, as one that only ever earned', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const earned = ['2025-06-30 Interest', '\tAssets:Bank 1000', '\tIncome:Interest', ''];
			await Files.createFile({ ledger, key: 'a.rupea', content: earned.join('\n') });

			const returns = (await Accounts.listReturns({ ledger, ...year }))._unsafeUnwrap();
			expect(returns.succeeded.map((r) => [r.account, r.netIn, r.xirr])).toEqual([
				['Assets', 0n, null],
				['Assets:Bank', 0n, null],
			]);
			expect(returns.failed).toEqual([{ type: 'ReturnUnsolved', account: 'Assets:Bank' }]);
		}));

	it('splits a transaction’s fees equally between what it holds other than rupees, the first taking what does not divide', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const moved = [
				'2025-01-01 Opening',
				'\tAssets:Zerodha 10 INFY @ 1000',
				'\tEquity:Opening',
				'',
				'2025-02-01 Move',
				'\tAssets:Zerodha -10 INFY',
				'\tAssets:IBKR 10 INFY',
				'\tExpenses:Fees 0.0000000003',
				'\tAssets:Bank',
				'',
				'P 2025-02-01 INFY 1200',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: moved });

			const flows = await DB.listFlows(ledger.id, {
				from: Temporal.PlainDate.from('2025-02-01'),
				to: Temporal.PlainDate.from('2025-02-01'),
			});
			expect(flows._unsafeUnwrap().map((f) => [f.account, f.amount])).toEqual([
				['Assets:Bank', -3n],
				['Assets:IBKR', 12000_0000000001n],
				['Assets:Zerodha', -11999_9999999998n],
			]);
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
		'\tExpenses:Travel 3 EUR',
		'\tLiabilities:Card',
		'',
		'P 2026-02-01 USD 83',
		'P 2026-03-01 USD 90',
		'',
	].join('\n');
	const buckets = (spending: Accounts.Spending | undefined) =>
		spending?.spent.map((s) => [s.account, s.bucket.toString(), s.amount, s.unpriced]);
	const totals = (spending: Accounts.Spending | undefined) =>
		spending?.totals.map((t) => [t.account, t.parent, t.amount, t.unpriced]);

	it('adds up each account and its parents by bucket, leaving out one in between, net of refunds, at its own day’s price, counting each unpriced amount', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2026-01-01', '2026-12-31')],
				bucket: 'month',
				account: 'Expenses',
			});
			const [year] = spending._unsafeUnwrap().succeeded;
			expect(buckets(year)).toEqual([
				['Expenses', '2026-01-01', 800_0000000000n, 0],
				['Expenses', '2026-02-01', 8300_0000000000n, 2],
				['Expenses:Food', '2026-01-01', 800_0000000000n, 0],
				['Expenses:Food:Groceries', '2026-01-01', 800_0000000000n, 0],
				['Expenses:Travel', '2026-02-01', 8300_0000000000n, 2],
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
				['Expenses', null, 9100_0000000000n, 2],
				['Expenses:Food:Groceries', 'Expenses', 800_0000000000n, 0],
				['Expenses:Travel', 'Expenses', 8300_0000000000n, 2],
			]);
		}));

	it('narrows to an account and those under it, ignoring case', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2026-01-01', '2026-12-31')],
				bucket: 'month',
				account: 'expenses:food',
			});
			expect(totals(spending._unsafeUnwrap().succeeded[0])).toEqual([
				['Expenses', null, 800_0000000000n, 0],
				['Expenses:Food:Groceries', 'Expenses', 800_0000000000n, 0],
			]);
		}));

	it('adds up an account written in two cases as one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-02 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-01-03 Dinner\n\tExpenses:food 50\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2026-01-01', '2026-01-31')],
				bucket: 'month',
				account: 'Expenses',
			});
			expect(totals(spending._unsafeUnwrap().succeeded[0])).toEqual([
				['Expenses', null, 150_0000000000n, 0],
				['Expenses:Food', 'Expenses', 150_0000000000n, 0],
			]);
		}));

	it('reads each span on its own, by day or year', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const byDay = await Accounts.listSpending({
				ledger,
				spans: [span('2026-01-15', '2026-01-31'), span('2026-01-01', '2026-01-14')],
				bucket: 'day',
				account: 'Expenses',
			});
			const byYear = await Accounts.listSpending({
				ledger,
				spans: [span('0001-01-01', '2026-12-31')],
				bucket: 'year',
				account: 'Expenses',
			});
			const [later, earlier] = byDay._unsafeUnwrap().succeeded;
			expect(buckets(later)?.[0]).toEqual(['Expenses', '2026-01-20', -200_0000000000n, 0]);
			expect(buckets(earlier)?.[0]).toEqual(['Expenses', '2026-01-10', 1000_0000000000n, 0]);
			expect(byYear._unsafeUnwrap().succeeded[0]?.buckets.map(String)).toEqual(['2026-01-01']);
			expect(buckets(byYear._unsafeUnwrap().succeeded[0])?.[0]).toEqual([
				'Expenses',
				'2026-01-01',
				9100_0000000000n,
				2,
			]);
		}));

	it('keeps a range’s empty buckets, and starts all of history on the first day spent', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2025-11-15', '2026-01-31'), span('0001-01-01', '2026-12-31')],
				bucket: 'month',
				account: 'Expenses',
			});
			const [range, all] = spending._unsafeUnwrap().succeeded;
			expect(range?.from.toString()).toBe('2025-11-15');
			expect(range?.buckets.map(String)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
			expect(all?.from.toString()).toBe('2026-01-10');
			expect(all?.buckets.map(String)).toHaveLength(12);
			expect(all?.buckets[0]?.toString()).toBe('2026-01-01');
		}));

	it('counts a group once', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const dinner = (role: string) => [
				'2026-10-02 Dinner',
				`\t- ${role}: dinner`,
				'\tExpenses:Food 500',
				'\tAssets:Bank',
				'',
			];
			await Files.createFile({ ledger, key: 'a.rupea', content: dinner('group').join('\n') });
			await Files.createFile({ ledger, key: 'b.rupea', content: dinner('same-as').join('\n') });

			const spending = await Accounts.listSpending({
				ledger,
				spans: [span('2026-10-01', '2026-10-31')],
				bucket: 'month',
				account: 'Expenses',
			});
			expect(totals(spending._unsafeUnwrap().succeeded[0])).toEqual([
				['Expenses', null, 500_0000000000n, 0],
				['Expenses:Food', 'Expenses', 500_0000000000n, 0],
			]);
		}));
});
