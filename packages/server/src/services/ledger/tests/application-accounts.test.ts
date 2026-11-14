import type { Database } from '#lib/server/db/index.ts';
import { provide, withContext } from '#lib/server/shared/context/context.ts';
import * as DB from '#services/ledger/adapters/database.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { AMOUNT_UNIT, parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { ProblemKind } from '#services/ledger/application/language.ts';
import { INVESTMENT_INCOME } from '#services/ledger/domain/taxonomy.ts';
import { idsIn } from '#services/ledger/domain/tree.ts';
import { Feed, PriceSource } from '#services/ledger/domain/types.ts';
import type { Aggregate, Bucket, Measure } from '@rupea/shared/balances.ts';
import { BEGINNING } from '@rupea/shared/dates.ts';
import { fault } from '@rupea/shared/errors.ts';
import { hasLots } from '@rupea/shared/money.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { heldOn, worthDaysOf, worthHeldOf } from './fixtures/held';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect, vi } from 'vitest';

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

			const rows = await heldOn(ledger, day);
			expect(
				rows.map((r) => [r.account, r.commodity, r.units, r.value, r.cost, r.unpriced]),
			).toEqual([
				['Assets', 'INFY', 7_0000000000n, 12600_0000000000n, 10900_0000000000n, 0],
				['Assets', 'INR', -10100_0000000000n, -10100_0000000000n, 0n, 0],
				['Assets', 'TCS', 1_0000000000n, 0n, 0n, 1],
				['Assets:Bank', 'INR', -10100_0000000000n, -10100_0000000000n, 0n, 0],
				['Assets:Zerodha', 'INFY', 7_0000000000n, 12600_0000000000n, 10900_0000000000n, 0],
				['Assets:Zerodha', 'TCS', 1_0000000000n, 0n, 0n, 1],
			]);
			expect(rows[4]?.price).toEqual({ amount: 1800_0000000000n, commodity: 'INR' });
		}));

	it('lists an account paid off to nothing once something was posted to it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-02 Spend',
				'\tExpenses:Food 500',
				'\tLiabilities:Card:IDFC',
				'',
				'2026-02-02 Pay',
				'\tLiabilities:Card:IDFC 500',
				'\tAssets:Bank',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const on = async (at: string) =>
				(await heldOn(ledger, Temporal.PlainDate.from(at)))
					.filter((r) => r.account.startsWith('Liabilities'))
					.map((r) => [r.account, r.value]);

			expect(await on('2026-02-10')).toEqual([
				['Liabilities', 0n],
				['Liabilities:Card:IDFC', 0n],
			]);
			expect(await on('2026-01-10')).toEqual([
				['Liabilities', -500_0000000000n],
				['Liabilities:Card:IDFC', -500_0000000000n],
			]);
			expect(await on('2025-12-31')).toEqual([]);
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
				const rows = await heldOn(ledger, Temporal.PlainDate.from(on));
				const holding = rows.find((r) => r.account === 'Assets:Zerodha');
				return [holding?.units, holding?.cost];
			};
			expect(await zerodha('2026-01-01')).toEqual([undefined, undefined]);
			expect(await zerodha('2026-02-28')).toEqual([10_0000000000n, 15000_0000000000n]);
			expect(await zerodha('2026-03-01')).toEqual([6_0000000000n, 9000_0000000000n]);
			expect(await zerodha('2026-03-20')).toEqual([7_0000000000n, 10600_0000000000n]);
		}));

	it('sums only the files that remain, as they are edited and deleted', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const bank = async () => worthHeldOf(await heldOn(ledger, day), 'Assets:Bank');
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

			const rows = (await heldOn(ledger, day)).filter((r) => r.account === 'Assets:IBKR');
			expect(rows.map((r) => [r.commodity, r.value, r.cost])).toEqual([
				['AAPL', 41500_0000000000n, 33200_0000000000n],
				['USD', 49800_0000000000n, 0n],
			]);
		}));

	it('values each ledger at its own prices of a commodity both hold', ({ context, db }) =>
		provide(context, async () => {
			const values = await Promise.all(
				[1600, 2000].map(async (price) => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupea', content: bought(price) });

					return (await heldOn(ledger, day)).find((r) => r.account === 'Assets:Zerodha')?.value;
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

describe('accounts', () => {
	it('lists every account with the one above it and whether anything is posted to it', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2026-10-01 Lunch\n\tExpenses:Food  5\n\tAssets:Bank\n',
			});

			const accounts = (await Accounts.listAccounts(ledger))._unsafeUnwrap();
			expect(accounts.toSorted((a, b) => a.account.localeCompare(b.account))).toEqual([
				{ account: 'Assets', parent: null, posted: false },
				{ account: 'Assets:Bank', parent: 'Assets', posted: true },
				{ account: 'Expenses', parent: null, posted: false },
				{ account: 'Expenses:Food', parent: 'Expenses', posted: true },
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

			const rows = await heldOn(ledger, day);
			const worth = await worthDaysOf(ledger, { from: day, to: day });
			expect(rows.map((r) => [r.account, r.value])).toEqual([
				['Assets', 500_0000000000n],
				['Assets:Bank', 500_0000000000n],
			]);
			expect(worth.map((w) => w.worth)).toEqual([500_0000000000n]);
		}));
});

describe('net worth', () => {
	const from = Temporal.PlainDate.from('2026-10-01');
	const to = Temporal.PlainDate.from('2026-10-03');
	const heldBy = async (ledger: Ledger, o: { account?: string; measures?: Measure[] }) => {
		const read = await Accounts.listBalances({
			ledger,
			from,
			to,
			bucket: 'date',
			accumulate: 'historical',
			...o,
		});
		const rows = read._unsafeUnwrap().succeeded[0]?.rows ?? [];

		return rows
			.filter((r) => r.bucket === to.toString())
			.map((r) => `${r.account} ${r.commodity ?? ''} ${(r.value ?? 0n) / AMOUNT_UNIT}`);
	};

	it('fails for an account nothing matches, in any case, but not for a root', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2026-10-02 Fund\n\tAssets:Bank 5\n\tIncome:Gift\n',
			});
			const read = (account: string) =>
				Accounts.listBalances({ ledger, from, to, bucket: 'date', account });

			expect((await read('Assets:Nope'))._unsafeUnwrapErr()).toEqual({
				type: 'AccountNotFound',
				account: 'Assets:Nope',
			});
			expect((await read('assets:BANK')).isOk()).toBe(true);
			expect((await read('EXPENSES'))._unsafeUnwrap().succeeded[0]?.rows).toEqual([]);
		}));

	it('gives the balance each bucket ends on as worth values it, by account', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-05 Salary\n\tAssets:Bank 100000\n\tIncome:Salary\n',
				'2026-02-01 Dinner\n\tExpenses:Food 2000\n\tLiabilities:Card\n',
				'2026-10-02 Fund\n\tAssets:IBKR 10 USD @ 83\n\tAssets:Bank\n',
				'P 2026-10-03 USD 90\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const read = async (bucket: Bucket) =>
				(
					await Accounts.listBalances({
						ledger,
						from: Temporal.PlainDate.from('2026-01-01'),
						to,
						bucket,
						accumulate: 'historical',
					})
				)._unsafeUnwrap().succeeded[0];
			const worth = await worthDaysOf(ledger, { from, to });
			const dates = await read('date');
			const months = await read('month');
			const at = (day: string, account: string) =>
				dates?.rows.find((r) => r.bucket === day && r.account === account)?.value;

			expect(worth.map((w) => [at(w.day, 'Assets'), at(w.day, 'Liabilities')])).toEqual(
				worth.map((w) => [w.assets, w.liabilities]),
			);
			expect(
				months?.rows.filter((r) => r.account === 'Assets:Bank').map((r) => [r.bucket, r.value]),
			).toEqual([
				['2026-01', 100000_0000000000n],
				['2026-02', 100000_0000000000n],
				['2026-03', 100000_0000000000n],
				['2026-04', 100000_0000000000n],
				['2026-05', 100000_0000000000n],
				['2026-06', 100000_0000000000n],
				['2026-07', 100000_0000000000n],
				['2026-08', 100000_0000000000n],
				['2026-09', 100000_0000000000n],
				['2026-10', 99170_0000000000n],
			]);
			expect(months?.rows.every((r) => r.inflow === undefined)).toBe(true);
		}));

	it('gives the units, price and cost of each commodity at the end of a bucket', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-10-01 Fund\n\tAssets:Bank 1000\n\tIncome:Salary\n',
				'2026-10-02 Buy\n\tAssets:IBKR 2 AAPL @ 40 USD\n\tAssets:IBKR -80 USD\n',
				'P 2026-10-01 USD 83\n',
				'P 2026-10-03 AAPL 50 USD\n',
				'P 2026-10-03 USD 90\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const read = (
				await Accounts.listBalances({
					ledger,
					from,
					to,
					account: 'Assets:IBKR',
					bucket: 'month',
					accumulate: 'historical',
					measures: ['units', 'price', 'cost', 'paid'],
				})
			)._unsafeUnwrap();
			const rows = read.succeeded[0]?.rows.filter((r) => r.account === 'Assets:IBKR');

			expect(rows?.map((r) => [r.commodity, r.units, r.price, r.cost, r.paid])).toEqual([
				[
					'AAPL',
					2_0000000000n,
					{ amount: 4500_0000000000n, commodity: 'INR' },
					7200_0000000000n,
					6640_0000000000n,
				],
				['USD', -80_0000000000n, { amount: 90_0000000000n, commodity: 'INR' }, 0n, 0n],
			]);
		}));

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

			const worth = await worthDaysOf(ledger, { from, to });
			const days = worth.map((w) => [w.day, w.assets, w.liabilities, w.worth, w.unpriced]);
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

					const worth = await worthDaysOf(ledger, { from, to });
					return worth.at(-1)?.worth;
				}),
			);

			expect(worths).toEqual([100_0000000000n, 500_0000000000n]);
		}));

	it('starts on the first day the ledger has, and is empty without one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const empty = await worthDaysOf(ledger, { from, to });
			const content = ['2026-10-02 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const worth = await worthDaysOf(ledger, { from, to });
			expect(empty).toEqual([]);
			expect(worth.map((w) => w.day)).toEqual(['2026-10-02', '2026-10-03']);
		}));

	it('refuses a historical read by day of the month', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);

			const worth = await Accounts.listBalances({
				ledger,
				from,
				to,
				bucket: 'day',
				accumulate: 'historical',
			});

			expect(worth._unsafeUnwrapErr()).toMatchObject({
				type: 'InvalidRequest',
				field: 'bucket',
			});
		}));

	it('refuses a span that runs backwards', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);

			const worth = await Accounts.listBalances({
				ledger,
				from: to,
				to: from,
				bucket: 'date',
				accumulate: 'historical',
			});

			expect(worth._unsafeUnwrapErr()).toEqual({
				type: 'SpanReversed',
				from: '2026-10-03',
				to: '2026-10-01',
			});
		}));

	it('counts the span from the first day with data, and refuses one over a hundred years', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const old = ['1900-01-01 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: old });
			const start = Temporal.PlainDate.from('1900-01-01');

			const worth = await Accounts.listBalances({
				ledger,
				from: start,
				to,
				bucket: 'year',
				accumulate: 'historical',
			});

			expect(worth._unsafeUnwrapErr()).toEqual({
				type: 'SpanTooLong',
				days: start.until(to, { largestUnit: 'days' }).days + 1,
				most: 36_600,
			});
		}));

	it('walks all of history up to today from the first day with data', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = ['2026-10-02 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const beginning = Temporal.PlainDate.from(BEGINNING);

			const worth = await worthDaysOf(ledger, { from: beginning, to });

			expect(worth.map((w) => w.day)).toEqual(['2026-10-02', '2026-10-03']);
		}));

	it('refuses a historical read by date over a year, and allows exactly 366 days', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = ['2025-01-01 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const read = (start: string, end: string) =>
				Accounts.listBalances({
					ledger,
					from: Temporal.PlainDate.from(start),
					to: Temporal.PlainDate.from(end),
					bucket: 'date',
					accumulate: 'historical',
				});

			const long = await read('2025-01-01', '2026-01-03');
			const year = await read('2025-01-01', '2026-01-02');
			const beginning = await read(BEGINNING, '2026-01-03');

			expect(long._unsafeUnwrapErr()).toEqual({ type: 'SpanTooLong', days: 367, most: 366 });
			expect(year.isOk()).toBe(true);
			expect(beginning._unsafeUnwrapErr()).toMatchObject({ type: 'SpanTooLong', most: 366 });
		}));

	it('refuses a change read by date over a year, and allows exactly 366 days', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = ['2025-01-01 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const read = (start: string, end: string) =>
				Accounts.listBalances({
					ledger,
					from: Temporal.PlainDate.from(start),
					to: Temporal.PlainDate.from(end),
					bucket: 'date',
				});

			const long = await read('2025-01-01', '2026-01-03');
			const year = await read('2025-01-01', '2026-01-02');
			const beginning = await read(BEGINNING, '2026-01-03');

			expect(long._unsafeUnwrapErr()).toEqual({ type: 'SpanTooLong', days: 367, most: 366 });
			expect(year.isOk()).toBe(true);
			expect(beginning._unsafeUnwrapErr()).toMatchObject({ type: 'SpanTooLong', most: 366 });
		}));

	it.for(['change', 'historical'] as const)(
		'refuses a %s read by date over a year before reading anything',
		async (accumulate, { context, db }) =>
			provide(context, async () => {
				const ledger = { ...(await createLedger(db)), id: 'missing' };

				const read = await Accounts.listBalances({
					ledger,
					from: Temporal.PlainDate.from('2025-01-01'),
					to: Temporal.PlainDate.from('2026-01-03'),
					bucket: 'date',
					accumulate,
				});

				expect(read._unsafeUnwrapErr()).toEqual({ type: 'SpanTooLong', days: 367, most: 366 });
			}),
	);

	it('answers an empty ledger read from the beginning as the day asked', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);

			const worth = await Accounts.listBalances({
				ledger,
				from: Temporal.PlainDate.from(BEGINNING),
				to,
				bucket: 'date',
				accumulate: 'historical',
			});

			const [balances] = worth._unsafeUnwrap().succeeded;
			expect(balances?.from).toEqual(to);
			expect(balances?.to).toEqual(to);
		}));

	it.for([
		['listDrops', Accounts.listDrops],
		['findBridge', Accounts.findBridge],
		['listReturns', Accounts.listReturns],
	] as const)(
		'refuses a span %s walks backwards or over a hundred years',
		async ([, list], { context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const old = ['1900-01-01 Buy', '\tAssets:Zerodha 1 INFY @ 1500', '\tAssets:Bank', ''].join(
					'\n',
				);
				await Files.createFile({ ledger, key: 'a.rupea', content: old });
				const start = Temporal.PlainDate.from('1900-01-01');

				const reversed = await list({ ledger, from: to, to: from, account: null });
				const long = await list({ ledger, from: start, to, account: null });

				expect(reversed._unsafeUnwrapErr()).toMatchObject({ type: 'SpanReversed' });
				expect(long._unsafeUnwrapErr()).toMatchObject({ type: 'SpanTooLong', most: 36_600 });
			}),
	);

	it('narrows to an account and those under it, by the month and by the day', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets:Bank:Savings 100\n\tIncome:Salary\n',
				'2026-10-02 Withdraw\n\tAssets:Cash 30\n\tAssets:Bank:Savings\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const worth = async (account: string) => {
				const days = await worthDaysOf(ledger, { from, to, account });
				return days.map((w) => `${w.day} ${w.worth / AMOUNT_UNIT}`);
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

			expect(await heldBy(ledger, {})).toEqual([
				'Assets  110',
				'Assets:Bank:Savings  80',
				'Assets:Bank:Savings:HDFC  70',
				'Assets:Bank:Savings:SBI  10',
				'Assets:Cash  30',
				'Liabilities  -20',
				'Liabilities:Card  -20',
			]);
			expect(await heldBy(ledger, { account: 'assets:bank' })).toEqual([
				'Assets  80',
				'Assets:Bank:Savings  80',
				'Assets:Bank:Savings:HDFC  70',
				'Assets:Bank:Savings:SBI  10',
			]);
			expect(await heldBy(ledger, { account: 'Assets:Bank:Savings:HDFC' })).toEqual([
				'Assets  70',
				'Assets:Bank:Savings  70',
				'Assets:Bank:Savings:HDFC  70',
			]);
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

			expect(await heldBy(ledger, {})).toEqual([
				'Assets  190',
				'Assets:Bank  180',
				'Assets:Bank:HDFC  100',
				'Assets:Bank:SBI  80',
				'Assets:Cash  10',
			]);
			expect(
				await heldBy(ledger, { account: 'Assets:Bank:HDFC', measures: ['value', 'units'] }),
			).toEqual([
				'Assets INR 20',
				'Assets USD 80',
				'Assets:Bank INR 20',
				'Assets:Bank USD 80',
				'Assets:Bank:HDFC INR 20',
				'Assets:Bank:HDFC USD 80',
			]);
		}));

	it('keeps what top accounts hold themselves apart, by account', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-20 Salary\n\tAssets 100\n\tIncome:Salary\n',
				'2026-10-02 Dinner\n\tExpenses:Food 40\n\tLiabilities\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			expect(await heldBy(ledger, {})).toEqual(['Assets  100', 'Liabilities  -40']);
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

			expect(await heldBy(ledger, { account: 'Assets:Bank' })).toEqual([
				'Assets  115',
				'Assets:bank:savings:sbi  10',
				'Assets:Bank:Savings  105',
				'Assets:Bank:Savings:HDFC  105',
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
				const days = await worthDaysOf(ledger, span);
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

	/**
	 * Saves a feed's quotes as a fetch would, for a symbol a ledger already
	 * links.
	 */
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
		(await heldOn(ledger, day)).find((r) => r.account === account)?.value;

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
			const worth = await worthDaysOf(ledger, { from, to });

			expect(worth.map((w) => [w.day, w.worth])).toEqual([
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

			const worth = await worthDaysOf(ledger, { from: day, to: day });
			expect(await valueOf(ledger, 'Assets:IBKR')).toBe(41500_0000000000n);
			expect(worth.map((w) => w.worth)).toEqual([9500_0000000000n]);
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

	it('gives all of history the same returns as a span from the first day with data', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const returnsFrom = async (from: string) =>
				(
					await Accounts.listReturns({ ledger, from: Temporal.PlainDate.from(from), to: year.to })
				)._unsafeUnwrap();

			const ever = await returnsFrom(BEGINNING);
			const first = await returnsFrom('2024-12-01');

			expect(ever.succeeded).toEqual(first.succeeded);
			expect(ever.failed).toEqual(first.failed);
		}));

	it('gives no returns for all of history ending before the first day with data', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const returns = await Accounts.listReturns({
				ledger,
				from: Temporal.PlainDate.from(BEGINNING),
				to: Temporal.PlainDate.from('2024-11-30'),
			});

			expect(returns._unsafeUnwrap().succeeded).toEqual([]);
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

	it('reports the problems of the ledger', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const error = fault('CannotReadFile', { path: 'a.rupea', reason: 'EACCES' });
			await db
				.insertInto('problems')
				.values({ ledgerId: ledger.id, kind: ProblemKind.Parse, error })
				.execute();

			const returns = (await Accounts.listReturns({ ledger, ...year }))._unsafeUnwrap();
			expect(returns.failed).toEqual([error]);
		}));

	it('reads every account read in one read-only transaction', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const open = new Set<boolean>();
			const find = DB.listProblems;
			const spy = vi.spyOn(DB, 'listProblems').mockImplementation((id) =>
				withContext('db')((d) => {
					open.add(d.isTransaction);
					return find(id);
				}),
			);

			try {
				const returns = await Accounts.listReturns({ ledger, ...year });
				returns._unsafeUnwrap();
			} finally {
				spy.mockRestore();
			}

			expect([...open]).toEqual([true]);
		}));

	it('values a commodity in the base asked for, through as many prices as it takes', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'P 2025-01-01 AAA 2 BBB',
				'P 2025-01-01 BBB 3 CCC',
				'P 2025-01-01 CCC 5 USD',
				'P 2025-01-01 INR 0.0125 USD',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const pair = (commodity: string) => ({
				commodity,
				day: Temporal.PlainDate.from('2025-01-02'),
			});
			const rates = await DB.listRates(ledger.id, {
				pairs: ['AAA', 'INR', 'USD'].map(pair),
				base: 'USD',
			});

			expect(rates._unsafeUnwrap().map((r) => [r.commodity, r.rate])).toEqual(
				expect.arrayContaining([
					['AAA', parseAmount('30')],
					['INR', parseAmount('0.0125')],
				]),
			);
		}));

	it('leaves out a commodity whose prices go round without reaching the base', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = ['P 2025-01-01 AAA 2 BBB', 'P 2025-01-01 BBB 3 AAA', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const rates = await DB.listRates(ledger.id, {
				pairs: [{ commodity: 'AAA', day: Temporal.PlainDate.from('2025-01-02') }],
				base: 'INR',
			});

			expect(rates._unsafeUnwrap()).toEqual([]);
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

			const tree = (await DB.listAccountTree(ledger.id))._unsafeUnwrap();
			const flows = await DB.listFlows(ledger.id, {
				earning: INVESTMENT_INCOME.flatMap((n) => idsIn(tree, n)),
				from: Temporal.PlainDate.from('2025-02-01'),
				to: Temporal.PlainDate.from('2025-02-01'),
				base: 'INR',
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
	const listed = async (
		ledger: Ledger,
		{
			from,
			to,
			...rest
		}: { from: string; to: string; account?: string; bucket?: Bucket; measures?: Measure[] },
		aggregate: Aggregate = 'sum',
	) => {
		const [deltas] = (
			await Accounts.listBalances({
				ledger,
				...span(from, to),
				bucket: 'month',
				aggregate,
				...rest,
			})
		)._unsafeUnwrap().succeeded;

		return deltas;
	};
	const buckets = (spending: Accounts.Balances | undefined) =>
		spending?.rows.map((r) => [r.account, r.bucket, r.value, r.unpriced]);
	const totals = (spending: Accounts.Balances | undefined) =>
		Object.entries(Object.groupBy(spending?.rows ?? [], (r) => r.account)).map(
			([account, rows]) => [
				account,
				rows?.reduce((n, r) => n + (r.value ?? 0n), 0n),
				rows?.reduce((n, r) => n + r.unpriced, 0),
			],
		);

	it('adds up Income as it adds up Expenses, as the negative amounts it is credited', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const pay = ['2026-01-05 Pay', '\tIncome:Salary -5000', '\tAssets:Bank', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: `${content}\n${pay}` });

			const year = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-12-31',
				account: 'Income',
			});
			expect(totals(year)).toEqual([
				['Income', -5000_0000000000n, 0],
				['Income:Salary', -5000_0000000000n, 0],
			]);
		}));

	it('adds up what came in and what went out of an account, which the net hides', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const flows = [
				'P 2026-01-01 USD 83',
				'',
				'2026-01-02 Spend',
				'\tExpenses:Food 500',
				'\tLiabilities:Card',
				'',
				'2026-01-20 Pay',
				'\tLiabilities:Card 500',
				'\tAssets:Bank',
				'',
				'2026-02-03 Spend in dollars',
				'\tExpenses:Food 10 USD',
				'\tLiabilities:Card',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: flows });

			const card = async (from: string, to: string) => {
				const spending = await listed(ledger, {
					from,
					to,
					account: 'Liabilities',
					measures: ['value', 'inflow', 'outflow'],
				});
				const rows = spending?.rows.filter((r) => r.account === 'Liabilities:Card') ?? [];
				const added = (k: 'value' | 'inflow' | 'outflow') =>
					rows.reduce((n, r) => n + (r[k] ?? 0n), 0n);

				return [added('value'), added('inflow'), added('outflow')];
			};

			expect(await card('2026-01-01', '2026-01-31')).toEqual([
				0n,
				500_0000000000n,
				500_0000000000n,
			]);
			expect(await card('2026-01-01', '2026-02-28')).toEqual([
				-830_0000000000n,
				500_0000000000n,
				1330_0000000000n,
			]);
			expect(await card('2026-01-10', '2026-01-25')).toEqual([
				500_0000000000n,
				500_0000000000n,
				0n,
			]);
		}));

	it('adds up only the days a span covers of the months at its edges, and the whole months between', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const more = ['2026-03-15 Fuel', '\tExpenses:Fuel 70', '\tAssets:Bank', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: `${content}\n${more}` });

			const food = (from: string, to: string) =>
				listed(ledger, { from, to, account: 'Expenses:Food' });
			const sums = (s: Accounts.Balances | undefined) =>
				totals(s).map(([account, amount]) => [account, amount]);
			expect(sums(await food('2026-01-11', '2026-01-31'))).toEqual([
				['Expenses', -200_0000000000n],
				['Expenses:Food:Groceries', -200_0000000000n],
			]);
			expect(sums(await food('2026-01-01', '2026-01-19'))).toEqual([
				['Expenses', 1000_0000000000n],
				['Expenses:Food:Groceries', 1000_0000000000n],
			]);
			expect(sums(await food('2026-01-15', '2026-03-14'))).toEqual([
				['Expenses', -200_0000000000n],
				['Expenses:Food:Groceries', -200_0000000000n],
			]);
		}));

	it('adds up each account and its parents by bucket, leaving out one in between, net of refunds, at its own day’s price, counting each unpriced amount', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const year = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-12-31',
				account: 'Expenses',
			});
			expect(buckets(year)).toEqual([
				['Expenses', '2026-01', 800_0000000000n, 0],
				['Expenses', '2026-02', 8300_0000000000n, 2],
				['Expenses:Food:Groceries', '2026-01', 800_0000000000n, 0],
				['Expenses:Travel', '2026-02', 8300_0000000000n, 2],
			]);
			expect(totals(year)).toEqual([
				['Expenses', 9100_0000000000n, 2],
				['Expenses:Food:Groceries', 800_0000000000n, 0],
				['Expenses:Travel', 8300_0000000000n, 2],
			]);
		}));

	it('averages spending on each day of the month over the months of the span that have it', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-31 Rent\n\tExpenses:Rent 300\n\tAssets:Bank\n',
				'2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-03-05 Lunch\n\tExpenses:Food 200\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const days = await listed(
				ledger,
				{ from: '2026-01-01', to: '2026-03-31', account: 'Expenses', bucket: 'day' },
				'average',
			);
			expect(
				days?.rows.filter((r) => r.account === 'Expenses').map((r) => [r.bucket, r.value]),
			).toEqual([
				['5', 100_0000000000n],
				['31', 150_0000000000n],
			]);
		}));

	it('keeps the sum of a day of the month when asked to sum', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-03-05 Lunch\n\tExpenses:Food 200\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const days = await listed(ledger, {
				from: '2026-02-01',
				to: '2026-03-31',
				account: 'Expenses',
				bucket: 'day',
			});
			expect(buckets(days)?.filter(([a]) => a === 'Expenses')).toEqual([
				['Expenses', '5', 300_0000000000n, 0],
			]);
		}));

	it('buckets by calendar date, and covers every account when none is named', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-03-05 Lunch\n\tExpenses:Food 200\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const dates = await listed(ledger, { from: '2026-02-01', to: '2026-03-31', bucket: 'date' });

			expect(buckets(dates)?.filter(([a]) => a === 'Expenses')).toEqual([
				['Expenses', '2026-02-05', 100_0000000000n, 0],
				['Expenses', '2026-03-05', 200_0000000000n, 0],
			]);
			expect(dates?.rows.map((r) => r.account)).toContain('Assets:Bank');
			expect(dates?.base).toBe('INR');
		}));

	it('carries only the measures asked for', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
			});

			const spending = await listed(ledger, {
				from: '2026-02-01',
				to: '2026-02-28',
				account: 'Expenses',
				measures: ['inflow'],
			});

			expect(spending?.rows[0]).toEqual({
				account: 'Expenses',
				commodity: null,
				bucket: '2026-02',
				unpriced: 0,
				inflow: 100_0000000000n,
			});
		}));

	it('narrows to an account and those under it, ignoring case', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-12-31',
				account: 'expenses:food',
			});
			expect(totals(spending)).toEqual([
				['Expenses', 800_0000000000n, 0],
				['Expenses:Food:Groceries', 800_0000000000n, 0],
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

			const spending = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-01-31',
				account: 'Expenses',
			});
			expect(totals(spending)).toEqual([
				['Expenses', 150_0000000000n, 0],
				['Expenses:Food', 150_0000000000n, 0],
			]);
		}));

	it('reads a span by day or by year', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const by = (from: string, to: string, bucket: Bucket) =>
				listed(ledger, { from, to, account: 'Expenses', bucket });
			const later = await by('2026-01-15', '2026-01-31', 'day');
			const earlier = await by('2026-01-01', '2026-01-14', 'day');
			const year = await by('0001-01-01', '2026-12-31', 'year');
			expect(buckets(later)?.[0]).toEqual(['Expenses', '20', -200_0000000000n, 0]);
			expect(buckets(earlier)?.[0]).toEqual(['Expenses', '10', 1000_0000000000n, 0]);
			expect(buckets(year)?.[0]).toEqual(['Expenses', '2026', 9100_0000000000n, 2]);
		}));

	it('starts all of history on the first day spent', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const range = await listed(ledger, {
				from: '2025-11-15',
				to: '2026-01-31',
				account: 'Expenses',
			});
			const all = await listed(ledger, {
				from: '0001-01-01',
				to: '2026-12-31',
				account: 'Expenses',
			});
			expect(range?.from.toString()).toBe('2025-11-15');
			expect(all?.from.toString()).toBe('2026-01-10');
		}));

	it('refuses a span that runs backwards', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const reply = await Accounts.listBalances({
				ledger,
				...span('2026-02-01', '2026-01-01'),
				account: 'Expenses',
				bucket: 'month',
				aggregate: 'sum',
			});
			expect(reply._unsafeUnwrapErr()).toMatchObject({ type: 'SpanReversed' });
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

			const spending = await listed(ledger, {
				from: '2026-10-01',
				to: '2026-10-31',
				account: 'Expenses',
			});
			expect(totals(spending)).toEqual([
				['Expenses', 500_0000000000n, 0],
				['Expenses:Food', 500_0000000000n, 0],
			]);
		}));

	describe('invested', () => {
		const valued = async (ledger: Ledger, account: string | null) => {
			const top = account ?? 'Assets';
			const read = await Accounts.listBalances({
				ledger,
				from: Temporal.PlainDate.from('2026-01-01'),
				to: Temporal.PlainDate.from('2026-10-05'),
				account: top,
				bucket: 'date',
				accumulate: 'historical',
				measures: ['value', 'paid', 'units'],
			});
			const lotted = read
				._unsafeUnwrap()
				.succeeded[0]?.rows.filter((r) => r.account === top && hasLots(r.commodity ?? ''));

			return ['2026-01-02', '2026-03-01', '2026-10-01'].map((day) => {
				const held = lotted?.filter((r) => r.bucket === day) ?? [];
				return [
					day,
					held.reduce((t, r) => t + (r.value ?? 0n), 0n),
					held.reduce((t, r) => t + (r.paid ?? 0n), 0n),
				];
			});
		};

		it('takes the cost of the lots a sale sold out, and not what it fetched', ({ context, db }) =>
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
					'2026-10-01 Buy',
					'\tAssets:Zerodha 1 INFY @ 1900',
					'\tAssets:Bank',
					'',
					'P 2026-10-01 INFY 1800',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				expect(await valued(ledger, null)).toEqual([
					['2026-01-02', 15000_0000000000n, 15000_0000000000n],
					['2026-03-01', 10200_0000000000n, 9000_0000000000n],
					['2026-10-01', 12600_0000000000n, 10900_0000000000n],
				]);
			}));

		it('gives the same cost and paid from a day on as a read from the beginning', ({
			context,
			db,
		}) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'P 2026-01-02 USD 80',
					'P 2026-02-01 USD 85',
					'P 2026-03-01 USD 90',
					'P 2026-03-01 AAPL 110 USD',
					'P 2026-10-01 INFY 1800',
					'',
					'2026-01-02 Buy',
					'\tAssets:Zerodha 10 INFY @ 1500',
					'\tAssets:Bank',
					'',
					'2026-01-02 Buy',
					'\tAssets:IBKR 2 AAPL @ 100 USD',
					'\tAssets:IBKR -200 USD',
					'',
					'2026-02-01 Buy',
					'\tAssets:IBKR 3 AAPL @ 100 USD',
					'\tAssets:IBKR -300 USD',
					'',
					'2026-03-01 Sell',
					'\tAssets:Zerodha -10 INFY {1500} @ 1700',
					'\tAssets:Bank 17000',
					'\tIncome:Gains -2000',
					'',
					'2026-03-01 Sell',
					'\tAssets:IBKR -2 AAPL {100 USD} @ 110 USD',
					'\tAssets:IBKR 220 USD',
					'\tIncome:Gains -20 USD',
					'',
					'2026-04-01 Buy',
					'\tAssets:Zerodha 4 INFY @ 1600',
					'\tAssets:Bank',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const read = async (from: string) =>
					(
						await Accounts.listBalances({
							ledger,
							from: Temporal.PlainDate.from(from),
							to: Temporal.PlainDate.from('2026-10-05'),
							account: 'Assets',
							bucket: 'month',
							accumulate: 'historical',
							measures: ['units', 'paid', 'cost'],
						})
					)
						._unsafeUnwrap()
						.succeeded[0]?.rows.filter((r) => r.bucket >= '2026-06')
						.map((r) => [r.account, r.commodity, r.bucket, r.paid, r.cost]);

				const later = await read('2026-06-01');

				expect(later?.length).toBeGreaterThan(0);
				expect(later).toEqual(await read(BEGINNING));
			}));

		it('values a cost in another currency at the price of the day it was paid', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'P 2026-01-02 USD 80',
					'P 2026-03-01 USD 90',
					'P 2026-03-01 AAPL 110 USD',
					'',
					'2026-01-02 Buy',
					'\tAssets:IBKR 2 AAPL @ 100 USD',
					'\tAssets:IBKR -200 USD',
					'',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				expect(await valued(ledger, 'Assets:IBKR')).toEqual([
					['2026-01-02', 16000_0000000000n, 16000_0000000000n],
					['2026-03-01', 19800_0000000000n, 16000_0000000000n],
					['2026-10-01', 19800_0000000000n, 16000_0000000000n],
				]);
			}));

		it('takes a sale in another currency out at the price of the day its lot was paid', ({
			context,
			db,
		}) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'P 2026-01-02 USD 80',
					'P 2026-03-01 USD 90',
					'P 2026-03-01 AAPL 110 USD',
					'',
					'2026-01-02 Buy',
					'\tAssets:IBKR 2 AAPL @ 100 USD',
					'\tAssets:IBKR -200 USD',
					'',
					'2026-03-01 Sell',
					'\tAssets:IBKR -2 AAPL {100 USD} @ 110 USD',
					'\tAssets:IBKR 220 USD',
					'\tIncome:Gains -20 USD',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				expect((await valued(ledger, 'Assets:IBKR'))[1]?.[2]).toBe(0n);
			}));

		it('counts a holding unpriced when a cost currency had no price the day it was paid', ({
			context,
			db,
		}) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-02 Buy',
					'\tAssets:IBKR 2 AAPL @ 100 USD',
					'\tAssets:IBKR -200 USD',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const rows = (
					await Accounts.listBalances({
						ledger,
						from: Temporal.PlainDate.from('2026-01-01'),
						to: Temporal.PlainDate.from('2026-01-31'),
						bucket: 'month',
						accumulate: 'historical',
						account: 'Assets:IBKR',
						measures: ['paid', 'units'],
					})
				)._unsafeUnwrap().succeeded[0]?.rows;

				expect(rows?.find((r) => r.commodity === 'AAPL')?.unpriced).toBeGreaterThan(0);
			}));

		it('reports a cost commodity with no price the day it was paid', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-02 Buy',
					'\tAssets:IBKR 2 AAPL @ 100 USD',
					'\tAssets:IBKR -200 USD',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const balances = (
					await Accounts.listBalances({
						ledger,
						from: Temporal.PlainDate.from('2026-01-01'),
						to: Temporal.PlainDate.from('2026-01-31'),
						bucket: 'month',
						accumulate: 'historical',
						account: 'Assets:IBKR',
						measures: ['paid', 'units'],
					})
				)._unsafeUnwrap();

				expect(balances.failed).toContainEqual({ type: 'CostUnpriced', commodity: 'USD' });
			}));

		describe('unmatched sales', () => {
			const sold = [
				'2026-01-01 Buy',
				'\tAssets:Zerodha 10 INFY @ 1500',
				'\tAssets:Bank',
				'',
				'2026-01-02 Sell',
				'\tAssets:Zerodha -4 INFY @ 1700',
				'\tAssets:Bank 6800',
				'\tIncome:Gains',
				'',
			].join('\n');

			const failures = async (ledger: Ledger, account: string, to: string) =>
				(
					await Accounts.listBalances({
						ledger,
						from: Temporal.PlainDate.from('2026-01-01'),
						to: Temporal.PlainDate.from(to),
						bucket: 'month',
						accumulate: 'historical',
						account,
						measures: ['cost'],
					})
				)
					._unsafeUnwrap()
					.failed.filter((f) => f.type === 'LotCostMissing');

			it('fails a read of the account holding the unmatched lot', ({ context, db }) =>
				provide(context, async () => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupea', content: sold });

					expect(await failures(ledger, 'Assets:Zerodha', '2026-01-31')).toHaveLength(1);
				}));

			it('does not fail a read of other accounts', ({ context, db }) =>
				provide(context, async () => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupea', content: sold });

					expect(await failures(ledger, 'Assets:Bank', '2026-01-31')).toEqual([]);
				}));

			it('does not fail a read that ends before the unmatched lot', ({ context, db }) =>
				provide(context, async () => {
					const ledger = await createLedger(db);
					await Files.createFile({ ledger, key: 'a.rupea', content: sold });

					expect(await failures(ledger, 'Assets:Zerodha', '2026-01-01')).toEqual([]);
				}));
		});

		it('counts only the holdings with lots, in the account asked for', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-02 Buy',
					'\tAssets:Zerodha 10 INFY @ 1500',
					'\tAssets:Bank',
					'',
					'2026-01-02 Buy',
					'\tAssets:Other 1 TCS @ 3000',
					'\tAssets:Bank',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				expect((await valued(ledger, 'Assets:Zerodha'))[0]).toEqual([
					'2026-01-02',
					15000_0000000000n,
					15000_0000000000n,
				]);
				expect((await valued(ledger, null))[0]).toEqual([
					'2026-01-02',
					18000_0000000000n,
					18000_0000000000n,
				]);
			}));
	});

	describe('drops', () => {
		const fell = async (ledger: Ledger, account: string | null = null) =>
			(
				await Accounts.listDrops({
					ledger,
					from: Temporal.PlainDate.from('2026-01-01'),
					to: Temporal.PlainDate.from('2026-01-31'),
					account,
				})
			)._unsafeUnwrap().succeeded[0];

		it('counts what prices did, and neither buying nor selling', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-02 Buy',
					'\tAssets:Zerodha 10 INFY @ 100',
					'\tAssets:Bank',
					'',
					'P 2026-01-10 INFY 80',
					'',
					'2026-01-15 Buy more',
					'\tAssets:Zerodha 10 INFY @ 80',
					'\tAssets:Bank',
					'',
					'P 2026-01-20 INFY 90',
					'',
					'2026-01-25 Sell',
					'\tAssets:Zerodha -15 INFY {80} @ 90',
					'\tAssets:Bank 1350',
					'\tIncome:Gains -150',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const drops = await fell(ledger);
				const depthOn = (day: string) => drops?.underwater.find((u) => `${u.day}` === day)?.depth;

				expect(drops?.lows.map((l) => [l.account, `${l.day}`])).toEqual([
					['Assets:Zerodha', '2026-01-10'],
				]);
				expect(drops?.lows[0]?.depth).toBeCloseTo(-0.2);
				expect(depthOn('2026-01-02')).toBe(0);
				expect(depthOn('2026-01-15')).toBeCloseTo(-0.2);
				expect(depthOn('2026-01-20')).toBeCloseTo(-0.1);
				expect(depthOn('2026-01-31')).toBeCloseTo(-0.1);
			}));

		it('gives each account with lots its own low, and none to one without', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-02 Buy',
					'\tAssets:Zerodha 10 INFY @ 100',
					'\tAssets:Bank',
					'',
					'2026-01-02 Buy',
					'\tAssets:Other 10 TCS @ 100',
					'\tAssets:Bank',
					'',
					'P 2026-01-10 INFY 50',
					'P 2026-01-10 TCS 110',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const lows = (await fell(ledger))?.lows.map((l) => [l.account, l.depth]);
				expect(lows).toEqual([
					['Assets:Zerodha', -0.5],
					['Assets:Other', 0],
				]);
				expect((await fell(ledger, 'Assets:Other'))?.lows.map((l) => l.account)).toEqual([
					'Assets:Other',
				]);
			}));

		it('scales the spread of the days a price moved to a year, once enough of them have', ({
			context,
			db,
		}) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const start = Temporal.PlainDate.from('2026-01-02');
				const quotes = Array.from(
					{ length: 70 },
					(_, i) => `P ${start.add({ days: i + 1 })} INFY ${i % 2 === 0 ? 101 : 100}`,
				);
				const content = [
					'2026-01-02 Buy',
					'\tAssets:Zerodha 10 INFY @ 100',
					'\tAssets:Bank',
					'2026-01-02 Buy',
					'\tAssets:Other 10 TCS @ 100',
					'\tAssets:Bank',
					...quotes,
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const drops = (
					await Accounts.listDrops({
						ledger,
						from: start,
						to: start.add({ days: 80 }),
						account: null,
					})
				)._unsafeUnwrap().succeeded[0];

				expect(drops?.swings.map((s) => s.account)).toEqual(['Assets:Zerodha']);
				expect(drops?.swings[0]?.swing).toBeCloseTo(0.158, 2);
			}));

		it('has nothing to say when no holding with lots was held', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = ['2026-01-02 Pay', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				expect(await fell(ledger)).toBeUndefined();
			}));
	});

	describe('bridge', () => {
		const crossed = async (ledger: Ledger) =>
			(
				await Accounts.findBridge({
					ledger,
					from: Temporal.PlainDate.from('2026-01-01'),
					to: Temporal.PlainDate.from('2026-01-31'),
				})
			)._unsafeUnwrap().succeeded[0];

		const UNIT = 10_000_000_000n;

		it('splits the change in net worth into income, expenses and price moves', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-01 Opening',
					'\tAssets:Bank 1000',
					'\tEquity:Opening',
					'',
					'2026-01-02 Buy',
					'\tAssets:Zerodha 10 INFY @ 100',
					'\tAssets:Bank',
					'',
					'2026-01-05 Pay',
					'\tAssets:Bank 500',
					'\tIncome:Salary',
					'',
					'2026-01-06 Rent',
					'\tExpenses:Rent 200',
					'\tAssets:Bank',
					'',
					'P 2026-01-10 INFY 120',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const bridge = await crossed(ledger);

				expect(bridge).toMatchObject({
					start: 1000n * UNIT,
					income: 500n * UNIT,
					expenses: 200n * UNIT,
					other: 0n,
					end: 1500n * UNIT,
				});
				expect(bridge?.shifts).toEqual([{ account: 'Assets:Zerodha', amount: 200n * UNIT }]);
			}));

		it('reads income and expenses only after the first day anything was held', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = ['2026-01-31 Opening', '\tAssets:Bank 1000', '\tEquity:Opening', ''].join(
					'\n',
				);
				await Files.createFile({ ledger, key: 'a.rupea', content });

				expect(await crossed(ledger)).toMatchObject({
					start: 1000n * UNIT,
					income: 0n,
					expenses: 0n,
					end: 1000n * UNIT,
				});
			}));

		it('keeps what neither income, expenses nor prices explain as other', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const content = [
					'2026-01-01 Opening',
					'\tAssets:Bank 1000',
					'\tEquity:Opening',
					'',
					'2026-01-10 Gift',
					'\tAssets:Bank 300',
					'\tEquity:Gifts',
					'',
				].join('\n');
				await Files.createFile({ ledger, key: 'a.rupea', content });

				const bridge = await crossed(ledger);

				expect(bridge).toMatchObject({ income: 0n, expenses: 0n, other: 300n * UNIT });
				expect(bridge?.shifts).toEqual([]);
			}));

		it('has nothing to say when nothing was held', ({ context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				await Files.createFile({ ledger, key: 'a.rupea', content: '' });

				expect(await crossed(ledger)).toBeUndefined();
			}));
	});
});
