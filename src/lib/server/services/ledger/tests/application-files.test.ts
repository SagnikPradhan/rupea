import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import { describe, expect } from 'vitest';
import { groceries, put, salary, summary } from './fixtures/files';

describe('mutations', () => {
	it('index what they write without a sync', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: groceries });
			expect(await summary(ledger.id)).toEqual(['a.rupea:1 Groceries']);

			await Files.renameFiles({ ledger, moves: [{ from: 'a.rupea', to: 'b.rupea' }] });
			expect(await summary(ledger.id)).toEqual(['b.rupea:1 Groceries']);

			await Files.deleteFiles({ ledger, keys: ['b.rupea'] });
			expect(await summary(ledger.id)).toEqual([]);
		}));

	it('leave the index alone when the write is refused', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: groceries });
			const again = await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: salary,
			});

			expect(again).toMatchObject({ error: { type: 'StorageConflict' } });
			expect(await summary(ledger.id)).toEqual(['a.rupea:1 Groceries']);
		}));
});

describe('moving files', () => {
	it('skips a file whose new name is taken, and moves the rest', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: groceries });
			await Files.createFile({ ledger, key: 'b.rupea', content: salary });
			await Files.createFile({ ledger, key: 'bank/b.rupea', content: salary });

			const moved = await Files.renameFiles({
				ledger,
				moves: [
					{ from: 'a.rupea', to: 'bank/a.rupea' },
					{ from: 'b.rupea', to: 'bank/b.rupea' },
				],
			});

			expect(moved).toMatchObject(
				ok({ succeeded: [{ key: 'bank/a.rupea' }], failed: [{ type: 'StorageConflict' }] }),
			);
			expect(await summary(ledger.id)).toEqual([
				'b.rupea:1 Salary',
				'bank/b.rupea:1 Salary',
				'bank/a.rupea:1 Groceries',
			]);
		}));

	it('counts what leaves the review area, and stops counting what enters it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: '_/a.rupea', content: groceries });
			await Files.createFile({ ledger, key: 'b.rupea', content: salary });

			await Files.renameFiles({
				ledger,
				moves: [
					{ from: '_/a.rupea', to: 'a.rupea' },
					{ from: 'b.rupea', to: '_/b.rupea' },
				],
			});
			expect(await summary(ledger.id)).toEqual(['a.rupea:1 Groceries']);
		}));
});

describe('adding a draft', () => {
	it('moves it to a new file, counting what it holds', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: '_/a.rupea', content: groceries });
			const added = await Files.addFile({ ledger, from: '_/a.rupea', to: 'hdfc/a.rupea' });

			expect(added).toMatchObject(
				ok({ file: { key: 'hdfc/a.rupea' }, added: 1, skipped: 0, before: null, draft: groceries }),
			);
			expect(await summary(ledger.id)).toEqual(['hdfc/a.rupea:1 Groceries']);
		}));

	it('merges it into a file there, and deletes it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: salary });
			await Files.createFile({ ledger, key: '_/a.rupea', content: `${groceries}\n${salary}` });
			const added = await Files.addFile({ ledger, from: '_/a.rupea', to: 'hdfc.rupea' });

			expect(added).toMatchObject(ok({ added: 1, skipped: 1, before: salary }));
			expect(await summary(ledger.id)).toEqual(['hdfc.rupea:1 Salary', 'hdfc.rupea:5 Groceries']);
			expect(await Files.readFile({ ledger, key: '_/a.rupea' })).toMatchObject({
				error: { type: 'CannotReadFile' },
			});
		}));

	it('finds the file an account was last added to', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'old.rupea', content: salary });
			await Files.createFile({ ledger, key: 'new.rupea', content: groceries });
			await Files.createFile({
				ledger,
				key: '_/later.rupea',
				content: groceries.replace('08-29', '09-30'),
			});

			const latest = (account: string) => Files.findLatestFile({ ledger, account });
			expect(await latest('Assets:Bank')).toEqual(ok('new.rupea'));
			expect(await latest('Assets:Cash')).toEqual(ok(null));
		}));
});

describe('adding a transaction from a form', () => {
	const posting = (account: string, amount = '') => ({
		account,
		amount,
		commodity: '',
		price: '',
		total: false,
		cost: '',
		costDate: '',
		balance: '',
		comment: '',
		metadata: [],
	});
	const form = {
		file: 'a.rupea',
		date: '2026-08-15',
		time: '',
		description: 'Coffee',
		comment: 'with Asha',
		metadata: [],
		postings: [posting('Expenses:Food', '5'), posting('Assets:Bank')],
	};

	it('writes it into its file by date and indexes it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: salary + '\n' + groceries });

			const created = await Files.createTransaction({ ledger, form });

			expect(created).toEqual(ok({ file: 'a.rupea', line: 5 }));
			expect(await summary(ledger.id)).toEqual([
				'a.rupea:1 Salary',
				'a.rupea:5 Coffee',
				'a.rupea:10 Groceries',
			]);
		}));

	it('makes the file when it is new', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);

			const created = await Files.createTransaction({ ledger, form: { ...form, file: 'n.rupea' } });

			expect(created).toEqual(ok({ file: 'n.rupea', line: 1 }));
			expect(await summary(ledger.id)).toEqual(['n.rupea:1 Coffee']);
		}));

	it('leaves the file alone when it does not balance', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: salary });

			const created = await Files.createTransaction({
				ledger,
				form: {
					...form,
					postings: [posting('Expenses:Food', '5'), posting('Assets:Bank', '-4')],
				},
			});

			expect(created).toMatchObject({ error: { type: 'ParseUnbalancedTransaction' } });
			expect(await Files.readFile({ ledger, key: 'a.rupea' })).toMatchObject({
				value: { content: salary },
			});
		}));

	it('offers the counted files, and the one with the latest transaction', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'b.rupea', content: groceries });
			await Files.createFile({ ledger, key: 'a.rupea', content: salary });
			await Files.createFile({
				ledger,
				key: '_/later.rupea',
				content: groceries.replace('08-29', '09-30'),
			});

			expect(await Files.findTransactionFiles(ledger)).toEqual(
				ok({ keys: ['a.rupea', 'b.rupea'], newest: 'b.rupea' }),
			);
		}));
});

describe('deleting files', () => {
	it('removes each from storage and the index', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: groceries });
			await Files.createFile({ ledger, key: 'b.rupea', content: salary });

			const deleted = await Files.deleteFiles({ ledger, keys: ['a.rupea', 'b.rupea'] });
			expect(deleted).toEqual(ok({ succeeded: ['a.rupea', 'b.rupea'], failed: [] }));
			expect(await summary(ledger.id)).toEqual([]);
			expect(await Files.listFiles(ledger)).toEqual(ok({ succeeded: [], failed: [] }));
		}));
});

describe('reading a file', () => {
	it('returns what is in storage, even before any sync', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupea', groceries);

			const file = await Files.readFile({ ledger, key: 'a.rupea' });
			expect(file.isOk() && file.value).toMatchObject({ key: 'a.rupea', content: groceries });
			expect(await summary(ledger.id)).toEqual([]);
		}));

	it('fails for a file that is not there', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(await Files.readFile({ ledger, key: 'a.rupea' })).toMatchObject({
				error: { type: 'CannotReadFile', path: 'a.rupea' },
			});
		}));
});
