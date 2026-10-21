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
				['Assets', 2500_000_000_000n, 1],
				['Assets:Bank', -10100_000_000_000n, 0],
				['Assets:Zerodha', 12600_000_000_000n, 1],
			]);
			expect(accounts[2]?.holdings).toMatchObject([
				{
					commodity: 'INFY',
					units: 7_000_000_000n,
					cost: { amount: 10900_000_000_000n, commodity: 'INR' },
					price: { amount: 1800_000_000_000n, commodity: 'INR' },
					gain: 1700_000_000_000n,
				},
				{ commodity: 'TCS', units: 1_000_000_000n, value: null },
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
				{ commodity: 'AAPL', value: 41500_000_000_000n, gain: 8300_000_000_000n },
				{ commodity: 'USD', value: 49800_000_000_000n, gain: null },
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
							units: -4_000_000_000n,
							gain: { amount: 800_000_000_000n, commodity: 'INR' },
						},
						{ kind: 'transfer', units: -6_000_000_000n, price: null, gain: null },
					],
				},
			]);

			const groww = (
				await Accounts.getLots({ ledger, account: 'Assets:Groww', commodity: 'INFY' })
			)._unsafeUnwrap();
			expect(groww.succeeded).toMatchObject([
				{ origin: 'transfer', from: 'Assets:Zerodha', remaining: 6_000_000_000n, disposals: [] },
			]);
		}));
});
