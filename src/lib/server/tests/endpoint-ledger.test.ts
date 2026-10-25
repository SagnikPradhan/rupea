import { listAccounts, listLots, listSpending, listWorth } from '#lib/endpoints/accounts.remote.ts';
import { createFile } from '#lib/endpoints/files.remote.ts';
import {
	listAccountNames,
	listPostings,
	listTransactions,
	sync,
} from '#lib/endpoints/transactions.remote.ts';
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
const filter = { range: 'all', from: '', to: '', account: '', description: '' } as const;

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
			const narrowed = { ...filter, from: '2026-08-15', to: '2026-08-29', account: 'Expenses' };
			const listed = await listTransactions({ handle, day, filter: narrowed, after: null });
			expect(listed.data?.rows.map((r) => r.description)).toEqual(['Groceries']);
		}));

	it('list postings and the names of accounts', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const postings = await listPostings({ handle, day, filter, after: null });
			expect(postings.data?.rows).toHaveLength(6);
			expect((await listAccountNames(handle)).data).toContain('Expenses:Food');
		}));
});

describe('accounts', () => {
	it('list balances, worth and lots', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const accounts = await listAccounts({ handle, day });
			const worth = await listWorth({ handle, range: '1y', day });
			const lots = await listLots({ handle, account: 'Assets:Broker', commodity: 'INFY' });

			expect(accounts.ok).toBe(true);
			expect(accounts.data?.map((a) => a.account)).toContain('Assets:Bank');
			expect(worth.ok).toBe(true);
			expect(lots.data).toHaveLength(1);
		}));

	it('list spending against the range before it, when there is one', ({
		context,
		ledger: handle,
	}) =>
		provide(context, async () => {
			const month = await listSpending({ handle, range: '1m', day });
			const all = await listSpending({ handle, range: 'all', day });

			expect(month.data).toHaveLength(2);
			expect(all.data).toHaveLength(1);
		}));
});
