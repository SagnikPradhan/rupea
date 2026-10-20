import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Transactions from '#services/ledger/application/transactions.ts';
import { formatAmount } from '#services/ledger/domain/amounts.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { groceries } from './fixtures/files';

describe('listing transactions', () => {
	it('returns exact amounts and source locations', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });
			const transactions = await Transactions.getTransactions(ledger);
			if (transactions.isErr()) throw new Error('getTransactions failed');

			const [groceriesTransaction] = transactions.value.succeeded;
			expect(groceriesTransaction).toMatchObject({
				location: { file: 'a.rupee', line: 1 },
				description: 'Groceries',
			});
			expect(
				groceriesTransaction?.postings.map(({ account, amount }) => [
					account,
					formatAmount(amount),
				]),
			).toEqual([
				['Expenses:Food', '100.50'],
				['Assets:Bank', '-100.50'],
			]);
		}));

	it('returns every field as the file wrote it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-08-01 Opening',
				'\tAssets:Bank 100000',
				'\tEquity:Opening',
				'',
				'2026-08-29 18:45 Bought shares',
				'\t- ref: 402-123',
				'\tAssets:Broker 10 INFY @ 1500.125',
				'\t\t- tags: long, tech',
				'\tAssets:Bank -15001.25 = 84998.75',
				'\tExpenses:Fees 20 USD @@ 1680',
				'\tAssets:Bank',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const listed = (await Transactions.getTransactions(ledger))._unsafeUnwrap();

			expect(listed.failed).toEqual([]);
			expect(listed.succeeded).toMatchObject(Files.parseFile('a.rupee', content).succeeded);
		}));
});
