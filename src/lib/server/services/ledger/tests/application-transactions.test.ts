import { provide } from '#lib/server/shared/context/context.ts';
import * as DB from '#services/ledger/adapters/database.ts';
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
			await Files.createFile({ ledger, key: 'a.rupea', content: groceries });

			const [groceriesTransaction] = await listed(ledger);
			expect(groceriesTransaction).toMatchObject({
				location: { file: 'a.rupea', line: 1 },
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
				'; from the passbook',
				'2026-08-01 Opening',
				'\tAssets:Bank 100000',
				'\tEquity:Opening',
				'',
				'2026-08-29 18:45 Bought shares',
				'\t- ref: 402-123',
				'\tAssets:Broker 10 INFY @ 1500.125',
				'\t\t- tags: long, tech',
				'\tAssets:Bank -15001.25 = 84998.75',
				'; charged in dollars',
				'; by the broker',
				'\tExpenses:Fees 20 USD @@ 1680',
				'\tAssets:Bank',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			expect(await listed(ledger)).toMatchObject(
				Files.parseFile({ key: 'a.rupea', content }).succeeded.toReversed(),
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

	const transactionPages = async (ledger: Ledger, after: DB.Cursor | null): Promise<string[]> => {
		const page = (
			await DB.listTransactions(ledger.id, { filter: everything, after, limit: 2 })
		)._unsafeUnwrap();
		const descriptions = page.rows.map((t) => t.description);
		return page.next
			? [...descriptions, ...(await transactionPages(ledger, page.next))]
			: descriptions;
	};

	const postingPages = async (
		ledger: Ledger,
		after: DB.PostingCursor | null,
	): Promise<string[]> => {
		const page = (
			await DB.listPostings(ledger.id, { filter: everything, after, limit: 3 })
		)._unsafeUnwrap();
		const rows = page.rows.map((p) => `${p.description} ${p.posting.account}`);
		return page.next ? [...rows, ...(await postingPages(ledger, page.next))] : rows;
	};

	it('pages through transactions on one day without skipping or repeating any', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: sameDay });

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
			await Files.createFile({ ledger, key: 'a.rupea', content: sameDay });

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

	const descriptions = (ledger: Ledger, filter: DB.ListFilter) =>
		DB.listTransactions(ledger.id, { filter, after: null, limit: 10 }).map((p) =>
			p.rows.map((t) => t.description),
		);
	const postings = (ledger: Ledger, filter: DB.ListFilter) =>
		DB.listPostings(ledger.id, { filter, after: null, limit: 10 }).map((p) =>
			p.rows.map((r) => `${r.description} ${r.posting.account}`),
		);

	it('keeps transactions between two days, both included', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const between = { ...everything, from: day('2026-08-02'), to: day('2026-08-03') };
			expect((await descriptions(ledger, between))._unsafeUnwrap()).toEqual([
				'SWIGGY lunch',
				'Swiggy dinner',
			]);
		}));

	it('finds a description by any part of it, whatever its case, wildcards included', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

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
			await Files.createFile({ ledger, key: 'a.rupea', content });

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
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const page = await DB.listPostings(ledger.id, {
				filter: { ...everything, account: 'Assets:Card' },
				after: null,
				limit: 10,
			});
			expect(page._unsafeUnwrap().rows.map((p) => p.posting.account)).toEqual(['Assets:Card']);
		}));

	it('narrows postings by account, description and day as it narrows transactions', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			expect(
				(await postings(ledger, { ...everything, account: 'expenses:food' }))._unsafeUnwrap(),
			).toEqual(['Market Expenses:Food', 'Swiggy dinner Expenses:Food:Delivery']);
			expect(
				(
					await postings(ledger, { ...everything, description: 'swiggy', from: day('2026-08-03') })
				)._unsafeUnwrap(),
			).toEqual(['SWIGGY lunch Expenses:Foodie', 'SWIGGY lunch Assets:Bank']);
			expect((await postings(ledger, { ...everything, description: '_' }))._unsafeUnwrap()).toEqual(
				[],
			);
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
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: transfer('group') });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: transfer('same-as') });

			const page = await DB.listPostings(ledger.id, {
				filter: everything,
				after: null,
				limit: 10,
			});
			expect(page._unsafeUnwrap().rows.map((p) => p.location.file)).toEqual([
				'hdfc.rupea',
				'hdfc.rupea',
			]);
		}));

	it('counts evidence again once its primary is gone', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: transfer('group') });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: transfer('same-as') });
			expect((await listed(ledger)).map((t) => [t.location.file, t.counted])).toEqual([
				['ibkr.rupea', false],
				['hdfc.rupea', true],
			]);

			await Files.deleteFiles({ ledger, keys: ['hdfc.rupea'] });

			expect((await listed(ledger)).map((t) => [t.location.file, t.counted])).toEqual([
				['ibkr.rupea', true],
			]);
		}));
});
