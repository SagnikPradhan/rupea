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
