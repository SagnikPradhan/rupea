import {
	listAccounts,
	listAccountTree,
	listLots,
	listReturns,
	listSpending,
	listWorth,
} from '#lib/endpoints/accounts.remote.ts';
import { createFile } from '#lib/endpoints/files.remote.ts';
import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
import { listPostings, listTransactions, sync } from '#lib/endpoints/transactions.remote.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { signIn } from '#tests/shared/app-server.ts';
import { createLedger, ownerOf } from '#tests/shared/seed.ts';
import { it as base } from '#tests/shared/vitest.ts';
import { describe, expect, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const books = [
	'2026-08-01 Salary',
	'\tAssets:Bank 50000',
	'\tIncome:Salary',
	'',
	'2026-08-29 Groceries',
	'\tExpenses:Food 100',
	'\tAssets:Bank',
	'',
	'2026-08-30 Shares',
	'\tAssets:Broker 2 INFY @ 1500',
	'\tAssets:Bank',
	'',
].join('\n');

const day = '2026-09-01';
const filter = { period: { kind: 'all' }, account: '', description: '' } as const;

/** A ledger its owner is signed in to, holding the books above. */
const it = base.extend<{ ledger: string }>({
	ledger: async ({ context, db }, use) => {
		const ledger = await createLedger(db);
		const handle = ledger.handle;
		signIn(ownerOf(ledger));
		await provide(context, () => createFile({ handle, key: 'a.rupea', content: books }));
		await use(handle);
		signIn(null);
	},
});

describe('transactions', () => {
	it('sync cleanly and list newest first', ({ context, ledger: handle }) =>
		provide(context, async () => {
			expect(await sync(handle)).toEqual({ ok: true, data: [], errors: [] });

			const listed = await listTransactions({ handle, day, filter, after: null });
			expect(listed.data?.rows.map((r) => r.description)).toEqual([
				'Shares',
				'Groceries',
				'Salary',
			]);
		}));

	it('narrow to a range and an account', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const period = { kind: 'custom', from: '2026-08-15', to: '2026-08-29' } as const;
			const narrowed = { ...filter, period, account: 'Expenses' };
			const listed = await listTransactions({ handle, day, filter: narrowed, after: null });
			expect(listed.data?.rows.map((r) => r.description)).toEqual(['Groceries']);
		}));

	it('list postings, the tree of accounts and the first day', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const postings = await listPostings({ handle, day, filter, after: null });
			expect(postings.data?.rows).toHaveLength(6);
			expect((await listAccountTree(handle)).data).toContainEqual({
				account: 'Expenses:Food',
				parent: 'Expenses',
			});
			expect((await findFirstDay(handle)).data).toBe('2026-08-01');
		}));
});

describe('accounts', () => {
	it('list balances, worth, returns and lots', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const year = { kind: 'year', at: '2026' } as const;
			const accounts = await listAccounts({ handle, day, period: year });
			const worth = await listWorth({ handle, day, period: year, account: null });
			const bank = await listWorth({ handle, day, period: year, account: 'assets:bank' });
			const returns = await listReturns({ handle, day, period: year });
			const lots = await listLots({ handle, account: 'Assets:Broker', commodity: 'INFY' });

			expect(accounts.ok).toBe(true);
			expect(accounts.data?.map((a) => a.account)).toContain('Assets:Bank');
			expect(worth.ok).toBe(true);
			expect(bank.data?.at(-1)?.worth).not.toBe(worth.data?.at(-1)?.worth);
			expect(returns.data).toContainEqual({
				account: 'Assets:Broker',
				netIn: '3000.00',
				xirr: expect.closeTo(0, 6),
				yearly: false,
			});
			expect(lots.data).toHaveLength(1);
		}));

	it('list spending against the period before it, when there is one', ({
		context,
		ledger: handle,
	}) =>
		provide(context, async () => {
			const month = await listSpending({
				handle,
				day,
				period: { kind: 'month', at: '2026-09' },
				account: 'Expenses',
			});
			const all = await listSpending({ handle, day, period: { kind: 'all' }, account: 'Expenses' });

			expect(month.data).toHaveLength(2);
			expect(all.data).toHaveLength(1);
		}));
});
