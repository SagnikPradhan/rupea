import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { groceries, put, salary, summary } from './fixtures/files';

describe('mutations', () => {
	it('index what they write without a sync', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });
			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Groceries']);

			await Files.renameFile({ ledger, from: 'a.rupee', to: 'b.rupee' });
			expect(await summary(ledger.id)).toEqual(['b.rupee:1 Groceries']);

			await Files.deleteFile(ledger, 'b.rupee');
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

describe('reading a file', () => {
	it('returns what is in storage, even before any sync', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', groceries);

			const file = await Files.getFile(ledger, 'a.rupee');
			expect(file.isOk() && file.value).toMatchObject({ key: 'a.rupee', content: groceries });
			expect(await summary(ledger.id)).toEqual([]);
		}));

	it('fails for a file that is not there', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(await Files.getFile(ledger, 'a.rupee')).toMatchObject({
				error: { type: 'CannotReadFile', path: 'a.rupee' },
			});
		}));
});
