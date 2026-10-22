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
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });
			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Groceries']);

			await Files.renameFiles({ ledger, moves: [{ from: 'a.rupee', to: 'b.rupee' }] });
			expect(await summary(ledger.id)).toEqual(['b.rupee:1 Groceries']);

			await Files.deleteFiles({ ledger, keys: ['b.rupee'] });
			expect(await summary(ledger.id)).toEqual([]);
		}));

	it('leave the index alone when the write is refused', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });
			const again = await Files.createFile({
				ledger,
				key: 'a.rupee',
				content: salary,
			});

			expect(again).toMatchObject({ error: { type: 'StorageConflict' } });
			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Groceries']);
		}));
});

describe('moving files', () => {
	it('skips a file whose new name is taken, and moves the rest', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });
			await Files.createFile({ ledger, key: 'b.rupee', content: salary });
			await Files.createFile({ ledger, key: 'bank/b.rupee', content: salary });

			const moved = await Files.renameFiles({
				ledger,
				moves: [
					{ from: 'a.rupee', to: 'bank/a.rupee' },
					{ from: 'b.rupee', to: 'bank/b.rupee' },
				],
			});

			expect(moved).toMatchObject(
				ok({ succeeded: [{ key: 'bank/a.rupee' }], failed: [{ type: 'StorageConflict' }] }),
			);
			expect(await summary(ledger.id)).toEqual([
				'b.rupee:1 Salary',
				'bank/b.rupee:1 Salary',
				'bank/a.rupee:1 Groceries',
			]);
		}));

	it('counts what leaves the review area, and stops counting what enters it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: '_/a.rupee', content: groceries });
			await Files.createFile({ ledger, key: 'b.rupee', content: salary });

			await Files.renameFiles({
				ledger,
				moves: [
					{ from: '_/a.rupee', to: 'a.rupee' },
					{ from: 'b.rupee', to: '_/b.rupee' },
				],
			});
			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Groceries']);
		}));
});

describe('deleting files', () => {
	it('removes each from storage and the index', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });
			await Files.createFile({ ledger, key: 'b.rupee', content: salary });

			const deleted = await Files.deleteFiles({ ledger, keys: ['a.rupee', 'b.rupee'] });
			expect(deleted).toEqual(ok({ succeeded: ['a.rupee', 'b.rupee'], failed: [] }));
			expect(await summary(ledger.id)).toEqual([]);
			expect(await Files.listFiles(ledger)).toEqual(ok({ succeeded: [], failed: [] }));
		}));
});

describe('reading a file', () => {
	it('returns what is in storage, even before any sync', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', groceries);

			const file = await Files.readFile({ ledger, key: 'a.rupee' });
			expect(file.isOk() && file.value).toMatchObject({ key: 'a.rupee', content: groceries });
			expect(await summary(ledger.id)).toEqual([]);
		}));

	it('fails for a file that is not there', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(await Files.readFile({ ledger, key: 'a.rupee' })).toMatchObject({
				error: { type: 'CannotReadFile', path: 'a.rupee' },
			});
		}));
});
