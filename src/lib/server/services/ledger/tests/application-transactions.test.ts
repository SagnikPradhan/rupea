import { provide } from '#lib/server/shared/context/context.ts';
import {
	index,
	type Cursor,
	type ListFilter,
	type PostingCursor,
} from '#services/ledger/adapters/database.ts';
import * as Files from '#services/ledger/application/files.ts';
import { formatAmount } from '#services/ledger/domain/amounts.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { everything, groceries, listed } from './fixtures/files';

const day = (iso: string) => Temporal.PlainDate.from(iso);

describe('listing transactions', () => {
	it('returns exact amounts and source locations', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });

			const [groceriesTransaction] = await listed(ledger);
			expect(groceriesTransaction).toMatchObject({
				location: { file: 'a.rupee', line: 1 },
				description: 'Groceries',
				counted: true,
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

	it('returns every field as the file wrote it, newest first', ({ context, db }) =>
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

			expect(await listed(ledger)).toMatchObject(
				Files.parseFile('a.rupee', content).succeeded.toReversed(),
			);
		}));
});

describe('paging', () => {
	const sameDay = [
		'2026-08-01 First',
		'\tExpenses:Food 1',
		'\tAssets:Bank',
		'',
		'2026-08-01 09:00 Timed',
		'\tExpenses:Food 2',
		'\tAssets:Bank',
		'',
		'2026-08-01 Second',
		'\tExpenses:Food 3',
		'\tAssets:Bank',
		'',
		'2026-08-01 Third',
		'\tExpenses:Food 4',
		'\tAssets:Bank',
		'',
		'2026-07-31 Before',
		'\tExpenses:Food 5',
		'\tAssets:Bank',
		'',
	].join('\n');

	const transactionPages = async (ledger: Ledger, after: Cursor | null): Promise<string[]> => {
		const page = (
			await index(ledger.id).transactionPage({ filter: everything, after, limit: 2 })
		)._unsafeUnwrap();
		const descriptions = page.rows.map((t) => t.description);
		return page.next
			? [...descriptions, ...(await transactionPages(ledger, page.next))]
			: descriptions;
	};

	const postingPages = async (ledger: Ledger, after: PostingCursor | null): Promise<string[]> => {
		const page = (
			await index(ledger.id).postingPage({ filter: everything, after, limit: 3 })
		)._unsafeUnwrap();
		const rows = page.rows.map((p) => `${p.description} ${p.posting.account}`);
		return page.next ? [...rows, ...(await postingPages(ledger, page.next))] : rows;
	};

	it('pages through transactions on one day without skipping or repeating any', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: sameDay });

			expect(await transactionPages(ledger, null)).toEqual([
				'Timed',
				'Third',
				'Second',
				'First',
				'Before',
			]);
		}));

	it('pages through postings, keeping a transaction’s postings in order across pages', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: sameDay });

			expect(await postingPages(ledger, null)).toEqual(
				['Timed', 'Third', 'Second', 'First', 'Before'].flatMap((d) => [
					`${d} Expenses:Food`,
					`${d} Assets:Bank`,
				]),
			);
		}));
});

describe('filtering', () => {
	const content = [
		'2026-08-01 Rent 100% paid',
		'\tExpenses:Rent 1000',
		'\tAssets:Bank',
		'',
		'2026-08-02 Swiggy dinner',
		'\tExpenses:Food:Delivery 300',
		'\tAssets:Card',
		'',
		'2026-08-03 SWIGGY lunch',
		'\tExpenses:Foodie 200',
		'\tAssets:Bank',
		'',
		'2026-08-04 Market',
		'\tExpenses:Food 100',
		'\tAssets:Bank',
		'',
	].join('\n');

	const descriptions = (ledger: Ledger, filter: ListFilter) =>
		index(ledger.id)
			.transactionPage({ filter, after: null, limit: 10 })
			.map((p) => p.rows.map((t) => t.description));

	it('keeps transactions on or after a day', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			expect(
				(await descriptions(ledger, { ...everything, from: day('2026-08-03') }))._unsafeUnwrap(),
			).toEqual(['Market', 'SWIGGY lunch']);
		}));

	it('finds a description by any part of it, whatever its case, wildcards included', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			expect(
				(await descriptions(ledger, { ...everything, description: 'swiggy' }))._unsafeUnwrap(),
			).toEqual(['SWIGGY lunch', 'Swiggy dinner']);
			expect(
				(await descriptions(ledger, { ...everything, description: '0%' }))._unsafeUnwrap(),
			).toEqual(['Rent 100% paid']);
			expect(
				(await descriptions(ledger, { ...everything, description: '_' }))._unsafeUnwrap(),
			).toEqual([]);
		}));

	it('keeps an account and the accounts under it, but not its siblings', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			expect(
				(await descriptions(ledger, { ...everything, account: 'expenses:food' }))._unsafeUnwrap(),
			).toEqual(['Market', 'Swiggy dinner']);
		}));

	it('lists only the postings to the account, with the rest of their transaction left out', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content });

			const page = await index(ledger.id).postingPage({
				filter: { ...everything, account: 'Assets:Card' },
				after: null,
				limit: 10,
			});
			expect(page._unsafeUnwrap().rows.map((p) => p.posting.account)).toEqual(['Assets:Card']);
		}));
});

describe('counting', () => {
	const transfer = (role: string) =>
		[
			'2026-10-03 NEFT IBKR',
			`\t- ${role}: 2026-10-03-ibkr-otter`,
			'\tAssets:IBKR 1000',
			'\tAssets:HDFC',
			'',
		].join('\n');

	it('leaves evidence out of the postings', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: transfer('event') });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: transfer('same-as') });

			const page = await index(ledger.id).postingPage({
				filter: everything,
				after: null,
				limit: 10,
			});
			expect(page._unsafeUnwrap().rows.map((p) => p.location.file)).toEqual([
				'hdfc.rupee',
				'hdfc.rupee',
			]);
		}));

	it('counts evidence again once its primary is gone', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: transfer('event') });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: transfer('same-as') });
			expect((await listed(ledger)).map((t) => [t.location.file, t.counted])).toEqual([
				['ibkr.rupee', false],
				['hdfc.rupee', true],
			]);

			await Files.deleteFiles(ledger, ['hdfc.rupee']);

			expect((await listed(ledger)).map((t) => [t.location.file, t.counted])).toEqual([
				['ibkr.rupee', true],
			]);
		}));
});
