import { describe, expect } from 'vitest';
import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context.ts';
import { it } from '#lib/server/shared/fixture.ts';
import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { index } from '../adapters/database';
import { formatAmount } from '../domain/types';
import * as Ledger from './ledger';
import { err, ok } from '#lib/server/shared/result.ts';

const groceries = '2026-08-29 Groceries\n\tExpenses:Food 100.5\n\tAssets:Bank\n';
const salary = '2026-08-01 Salary\n\tAssets:Bank 50000\n\tIncome:Salary\n';

/** A user with a ledger of their own. */
const createUser = async (db: Database) => {
	const { id: ledgerId } = await db.orm.Ledger.create({ name: 'Test' });
	const { id: userId } = await db.orm.User.create({
		email: `${ledgerId}@example.com`,
		ledgerId,
	});
	return { userId, ledgerId };
};

/** Write a file straight into a ledger's storage, behind the app's back. */
const put = (storage: Storage, ledgerId: string, key: string, text: string) =>
	scoped(storage, `ledgers/${ledgerId}`).write({
		key,
		content: new TextEncoder().encode(text),
	});

/** The indexed transactions as `file:line description` lines. */
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
			await put(storage, ledgerId, 'a.rupee', `${groceries}\tbad posting x\n`);

			const problem = {
				type: 'ParseInvalidPosting',
				location: 'a.rupee:4',
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
					amount === null ? null : formatAmount(amount),
				]),
			).toEqual([
				['Expenses:Food', '100.50'],
				['Assets:Bank', null],
			]);
		}));
});
