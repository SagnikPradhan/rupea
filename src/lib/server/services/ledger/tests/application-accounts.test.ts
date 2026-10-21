import { provide } from '#lib/server/shared/context/context.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';

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

			const accounts = (await Accounts.getAccounts(ledger, day))._unsafeUnwrap().succeeded;
			expect(accounts.map((a) => [a.account, a.total, a.unpriced])).toEqual([
				['Assets:Bank', -10100_0000000000n, 0],
				['Assets:Zerodha', 12600_0000000000n, 1],
			]);
			expect(accounts[1]?.holdings).toMatchObject([
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

			const accounts = (await Accounts.getAccounts(ledger, day))._unsafeUnwrap().succeeded;
			expect(accounts.find((a) => a.account === 'Assets:IBKR')?.holdings).toMatchObject([
				{ commodity: 'AAPL', value: 41500_0000000000n, gain: 8300_0000000000n },
				{ commodity: 'USD', value: 49800_0000000000n, gain: null },
			]);
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
				await Accounts.getLots({ ledger, account: 'Assets:Zerodha', commodity: 'INFY' })
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
				await Accounts.getLots({ ledger, account: 'Assets:Groww', commodity: 'INFY' })
			)._unsafeUnwrap();
			expect(groww.succeeded).toMatchObject([
				{ origin: 'transfer', from: 'Assets:Zerodha', remaining: 6_0000000000n, disposals: [] },
			]);
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

			const worth = (await Accounts.getWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;
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

	it('starts on the first day the ledger has, and is empty without one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const empty = (await Accounts.getWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;
			const content = ['2026-10-02 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const worth = (await Accounts.getWorth({ ledger, from, to }))._unsafeUnwrap().succeeded;
			expect(empty).toEqual([]);
			expect(worth.map((w) => w.day.toString())).toEqual(['2026-10-02', '2026-10-03']);
		}));
});
