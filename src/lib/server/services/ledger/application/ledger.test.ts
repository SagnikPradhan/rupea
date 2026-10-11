import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { ledgerFiles, metadata, users } from '#lib/server/db/schema.ts';
import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context.ts';
import { createUser } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { index } from '../adapters/database';
import { formatAmount } from '../domain/types';
import * as Ledger from './ledger';
import { err, ok } from '#lib/server/shared/result.ts';

const groceries = '2026-08-29 Groceries\n\tExpenses:Food 100.5\n\tAssets:Bank\n';
const salary = '2026-08-01 Salary\n\tAssets:Bank 50000\n\tIncome:Salary\n';

const annotated = [
	'- statement: hdfc-oct.pdf',
	'',
	'2026-08-29 Groceries',
	'\t- ref: a',
	'\t- note: weekly shop',
	'\t- ref: b',
	'\tExpenses:Food 100.5',
	'\t\t- tags: weekly',
	'\tAssets:Bank',
	'',
].join('\n');

const fileMetadata = async (db: Database, ledgerId: string) =>
	(
		await db
			.select({ key: metadata.key, value: metadata.value })
			.from(metadata)
			.innerJoin(ledgerFiles, eq(ledgerFiles.id, metadata.fileId))
			.where(eq(ledgerFiles.ledgerId, ledgerId))
			.orderBy(asc(metadata.position))
	).map((r) => [r.key, r.value]);

const put = (storage: Storage, ledgerId: string, key: string, text: string) =>
	scoped(storage, `ledgers/${ledgerId}`).write({
		key,
		content: new TextEncoder().encode(text),
	});

const summary = async (ledgerId: string) => {
	const indexed = await index(ledgerId).transactions();
	return indexed.isOk()
		? indexed.value.map(
				({ location, description }) => `${location.file}:${location.line} ${description}`,
			)
		: indexed;
};

describe('syncing the ledger', () => {
	it('indexes new files, ordered by date', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await put(storage, ledgerId, 'a.rupee', groceries);
			await put(storage, ledgerId, 'b/c.rupee', salary);
			await put(storage, ledgerId, 'notes.txt', 'not a ledger file');

			expect(await Ledger.sync(userId)).toEqual(ok([]));
			expect(await summary(ledgerId)).toEqual(['b/c.rupee:1 Salary', 'a.rupee:1 Groceries']);
		}));

	it('indexes metadata of the file, its transactions and their postings', ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await put(storage, ledgerId, 'a.rupee', annotated);
			await Ledger.sync(userId);

			const [indexed] = (await index(ledgerId).transactions())._unsafeUnwrap();
			expect(indexed?.metadata).toEqual({ ref: ['a', 'b'], note: ['weekly shop'] });
			expect(indexed?.postings.map((p) => p.metadata)).toEqual([{ tags: ['weekly'] }, {}]);
			expect(await fileMetadata(db, ledgerId)).toEqual([['statement', 'hdfc-oct.pdf']]);
		}));

	it('leaves no metadata behind when a file changes or goes', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			// Other tests share the database, so count only what this one adds.
			const before = await db.$count(metadata);
			await put(storage, ledgerId, 'a.rupee', annotated);
			await Ledger.sync(userId);
			expect(await db.$count(metadata)).toBe(before + 5);

			await put(storage, ledgerId, 'a.rupee', `- statement: other.pdf\n\n${groceries}`);
			await Ledger.sync(userId);
			expect(await db.$count(metadata)).toBe(before + 1);

			await scoped(storage, `ledgers/${ledgerId}`).delete('a.rupee');
			await Ledger.sync(userId);
			expect(await db.$count(metadata)).toBe(before);
		}));

	it('re-indexes changed files and drops deleted ones', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await put(storage, ledgerId, 'a.rupee', groceries);
			await put(storage, ledgerId, 'b.rupee', salary);
			await Ledger.sync(userId);

			await put(storage, ledgerId, 'a.rupee', `${salary}${groceries}`);
			await scoped(storage, `ledgers/${ledgerId}`).delete('b.rupee');
			await Ledger.sync(userId);

			expect(await summary(ledgerId)).toEqual(['a.rupee:1 Salary', 'a.rupee:4 Groceries']);
		}));

	it('reports parse errors on every sync until the file is fixed', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await put(storage, ledgerId, 'a.rupee', `${groceries}2026-08-30 Bad\n\tbad posting x\n`);

			const problem = {
				type: 'ParseInvalidPosting',
				location: 'a.rupee:5',
				cause: [],
			};
			expect(await Ledger.sync(userId)).toEqual(ok([problem]));
			expect(await Ledger.sync(userId)).toEqual(ok([problem]));
			// What did parse is indexed meanwhile.
			expect(await summary(ledgerId)).toEqual(['a.rupee:1 Groceries']);

			await put(storage, ledgerId, 'a.rupee', groceries);
			expect(await Ledger.sync(userId)).toEqual(ok([]));
		}));

	it('orders a day by time, untimed first', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			const body = '\tExpenses:Food 1\n\tAssets:Bank\n';
			await put(
				storage,
				ledgerId,
				'a.rupee',
				[
					`29 Aug 2026 9:15 pm Dinner\n${body}`,
					`29/08/2026 08:00 Breakfast\n${body}`,
					`2026-08-29 Untimed\n${body}`,
				].join('\n'),
			);
			await Ledger.sync(userId);

			expect(await summary(ledgerId)).toEqual([
				'a.rupee:9 Untimed',
				'a.rupee:5 Breakfast',
				'a.rupee:1 Dinner',
			]);
		}));

	it('keeps ledgers apart', ({ context, db, storage }) =>
		provide(context, async () => {
			const one = await createUser(db);
			const two = await createUser(db);
			await put(storage, one.ledgerId, 'a.rupee', groceries);
			await Ledger.sync(one.userId);
			await Ledger.sync(two.userId);

			expect(await summary(two.ledgerId)).toEqual([]);
		}));
});

describe('mutations', () => {
	it('index what they write without a sync', ({ context, db }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'a.rupee', content: groceries });
			expect(await summary(ledgerId)).toEqual(['a.rupee:1 Groceries']);

			await Ledger.renameFile({ userId, from: 'a.rupee', to: 'b.rupee' });
			expect(await summary(ledgerId)).toEqual(['b.rupee:1 Groceries']);

			await Ledger.deleteFile(userId, 'b.rupee');
			expect(await summary(ledgerId)).toEqual([]);
		}));

	it('leave the index alone when the write is refused', ({ context, db }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'a.rupee', content: groceries });
			const again = await Ledger.createFile({
				userId,
				key: 'a.rupee',
				content: salary,
			});

			expect(again).toMatchObject(err({ type: 'StorageConflict' }));
			expect(await summary(ledgerId)).toEqual(['a.rupee:1 Groceries']);
		}));
});

describe('reading a file', () => {
	it('returns what is in storage, even before any sync', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId, ledgerId } = await createUser(db);
			await put(storage, ledgerId, 'a.rupee', groceries);

			const file = await Ledger.getFile(userId, 'a.rupee');
			expect(file.isOk() && file.value).toMatchObject({ key: 'a.rupee', content: groceries });
			expect(await summary(ledgerId)).toEqual([]);
		}));

	it('fails for a file that is not there', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			expect(await Ledger.getFile(userId, 'a.rupee')).toMatchObject(
				err({ type: 'CannotReadFile', path: 'a.rupee' }),
			);
		}));
});

describe('listing transactions', () => {
	it('returns exact amounts and source locations', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'a.rupee', content: groceries });
			const transactions = await Ledger.getTransactions(userId);
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
			const { userId } = await createUser(db);
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
			await Ledger.createFile({ userId, key: 'a.rupee', content });

			const listed = (await Ledger.getTransactions(userId))._unsafeUnwrap();

			expect(listed.failed).toEqual([]);
			expect(listed.succeeded).toMatchObject(Ledger.check('a.rupee', content).succeeded);
		}));

	it('fails for a user without a ledger', ({ context, db }) =>
		provide(context, async () => {
			const userId = uuidv7();
			await db.insert(users).values({ id: userId, email: `${userId}@example.com` });

			expect(await Ledger.getTransactions(userId)).toEqual(
				err({ type: 'LedgerNotFound', userId, cause: [] }),
			);
		}));
});

describe('events across files', () => {
	const transfer = (role: string, amount: string) =>
		[
			'2026-10-03 NEFT IBKR',
			`\t- ${role}: 2026-10-03-ibkr-otter`,
			`\tAssets:IBKR ${amount}`,
			'\tAssets:HDFC',
			'',
		].join('\n');

	it('counts an event once, keeping its evidence', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: transfer('event', '1000') });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: transfer('same-as', '1000') });
			await Ledger.createFile({ userId, key: 'a.rupee', content: groceries });

			expect(await Ledger.sync(userId)).toEqual(ok([]));
			const listed = (await Ledger.getTransactions(userId))._unsafeUnwrap();
			expect(listed.failed).toEqual([]);
			expect(listed.succeeded.map((t) => [t.location.file, t.counted])).toEqual([
				['a.rupee', true],
				['hdfc.rupee', true],
				['ibkr.rupee', false],
			]);
		}));

	it('reports a broken event on every sync and counts all of it', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: transfer('same-as', '1000') });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: transfer('same-as', '1000') });

			const problem = {
				type: 'EventWithoutPrimary',
				event: '2026-10-03-ibkr-otter',
				location: 'hdfc.rupee:1, ibkr.rupee:1',
				cause: [],
			};
			expect(await Ledger.sync(userId)).toEqual(ok([problem]));
			expect(await Ledger.sync(userId)).toEqual(ok([problem]));
			const listed = (await Ledger.getTransactions(userId))._unsafeUnwrap();
			expect(listed.failed).toEqual([problem]);
			expect(listed.succeeded.every((t) => t.counted)).toBe(true);
		}));

	it('reports evidence that disagrees with its primary', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: transfer('event', '1000') });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: transfer('same-as', '999') });

			expect((await Ledger.sync(userId))._unsafeUnwrap()).toMatchObject([
				{ type: 'EventDisagreement', location: 'ibkr.rupee:1', account: 'Assets:IBKR' },
				{ type: 'EventDisagreement', location: 'ibkr.rupee:1', account: 'Assets:HDFC' },
			]);
		}));
});

describe('balance assertions', () => {
	const opening = '2026-08-01 Opening\n\tAssets:Bank 1000\n\tEquity:Opening\n';
	const statement = [
		'2026-08-02 TEA',
		'\tAssets:Bank -100 = 900',
		'\tExpenses:Food',
		'',
		'2026-08-02 BOOKS',
		'\tAssets:Bank -50 = 850',
		'\tExpenses:Books',
		'',
		'2026-08-03 REFUND',
		'\tAssets:Bank 200 = 1050',
		'\tIncome:Refunds',
		'',
	].join('\n');

	it('checks the running balance across days and files', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'opening.rupee', content: opening });
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: statement });

			expect(await Ledger.sync(userId)).toEqual(ok([]));
		}));

	it('reports an assertion that does not hold, on every listing', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'opening.rupee', content: opening });
			await Ledger.createFile({
				userId,
				key: 'hdfc.rupee',
				content: statement.replace('= 850', '= 800'),
			});

			const problem = {
				type: 'BalanceAssertionFailed',
				location: 'hdfc.rupee:5',
				account: 'Assets:Bank',
				expected: '800.00',
				actual: '850.00',
				cause: [],
			};
			expect(await Ledger.sync(userId)).toEqual(ok([problem]));
			expect((await Ledger.getTransactions(userId))._unsafeUnwrap().failed).toEqual([problem]);
		}));

	it('orders another file by time, and warns when it cannot', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'opening.rupee', content: opening });
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: statement });
			await Ledger.createFile({
				userId,
				key: 'cash.rupee',
				content: '2026-08-02 ATM\n\tAssets:Bank -10\n\tAssets:Cash\n',
			});

			expect((await Ledger.sync(userId))._unsafeUnwrap()).toEqual([
				{
					type: 'BalanceAssertionAmbiguous',
					location: 'hdfc.rupee:1',
					account: 'Assets:Bank',
					unordered: 'cash.rupee:1',
					cause: [],
				},
				expect.objectContaining({ type: 'BalanceAssertionAmbiguous', location: 'hdfc.rupee:5' }),
				expect.objectContaining({ type: 'BalanceAssertionFailed', location: 'hdfc.rupee:9' }),
			]);
		}));

	it('places an event at its primary', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'opening.rupee', content: opening });
			await Ledger.createFile({
				userId,
				key: 'hdfc.rupee',
				content: statement
					.replace('2026-08-02 TEA', '2026-08-02 09:00 TEA')
					.replace('2026-08-02 BOOKS\n', '2026-08-02 10:05 BOOKS\n\t- same-as: books\n'),
			});
			await Ledger.createFile({
				userId,
				key: 'amazon.rupee',
				content: [
					'2026-08-02 10:00 Amazon order',
					'\t- event: books',
					'\tAssets:Bank -50',
					'\tExpenses:Books 30',
					'\tExpenses:Stationery 20',
					'',
				].join('\n'),
			});

			expect(await Ledger.sync(userId)).toEqual(ok([]));
		}));

	it('checks each commodity of an account on its own', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const ibkr = (aapl: string) =>
				[
					'2026-10-01 Fund',
					'\tAssets:IBKR 1000 USD @ 83',
					'\tAssets:HDFC',
					'',
					'2026-10-02 Buy',
					`\tAssets:IBKR 2 AAPL @ 200 USD = ${aapl} AAPL`,
					'\tAssets:IBKR -400 USD = 600 USD',
					'',
				].join('\n');
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr('2') });
			expect(await Ledger.sync(userId)).toEqual(ok([]));

			await Ledger.deleteFile(userId, 'ibkr.rupee');
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr('3') });
			expect(await Ledger.sync(userId)).toEqual(
				ok([
					{
						type: 'BalanceAssertionFailed',
						location: 'ibkr.rupee:5',
						account: 'Assets:IBKR',
						expected: '3.00 AAPL',
						actual: '2.00 AAPL',
						cause: [],
					},
				]),
			);
		}));
});
