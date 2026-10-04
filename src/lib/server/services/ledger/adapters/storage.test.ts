import { describe, expect } from 'vitest';
import { it } from '#tests/shared/vitest.ts';
import { files } from './storage';
import { err, ok } from '#lib/server/shared/result.ts';

describe('files', () => {
	it('lists only .rupee files, as text', async ({ storage }) => {
		const ledger = files(storage);
		await ledger.write({ key: 'bank/a.rupee', content: 'hello' });
		await ledger.write({ key: 'notes.txt', content: 'ignored' });
		const listed = await ledger.list();
		expect(listed).toMatchObject(
			ok({
				succeeded: [{ key: 'bank/a.rupee', content: 'hello' }],
				failed: [],
			}),
		);
	});

	it('carries a file that is not UTF-8 as a failure in the batch', async ({ storage }) => {
		await storage.write({
			key: 'bad.rupee',
			content: new Uint8Array([0xff, 0xfe]),
		});
		await files(storage).write({ key: 'good.rupee', content: 'ok' });
		const listed = await files(storage).list();
		expect(listed).toMatchObject(
			ok({
				succeeded: [{ key: 'good.rupee' }],
				failed: [{ type: 'CannotReadFile', path: 'bad.rupee' }],
			}),
		);
	});

	it('reports a missing file as one that cannot be read', async ({ storage }) => {
		expect(await files(storage).read('missing.rupee')).toMatchObject(
			err({
				type: 'CannotReadFile',
				path: 'missing.rupee',
				cause: [{ type: 'StorageNotFound' }],
			}),
		);
	});

	it('renames and reads back the moved file', async ({ storage }) => {
		const ledger = files(storage);
		await ledger.write({ key: 'a.rupee', content: 'x' });
		expect(await ledger.rename('a.rupee', 'b/c.rupee')).toMatchObject(
			ok({ key: 'b/c.rupee', content: 'x' }),
		);
	});
});
