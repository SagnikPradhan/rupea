import {
	addFile,
	createFile,
	deleteFiles,
	editFile,
	findLatestFile,
	formatFile,
	listFiles,
	parseFile,
	readFile,
	renameFiles,
} from '#lib/endpoints/files.remote.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { signIn } from '#tests/shared/app-server.ts';
import { createLedger, ownerOf } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { afterEach, describe, expect, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

afterEach(() => signIn(null));

const groceries = '2026-08-29 Groceries\n\tExpenses:Food 100\n\tAssets:Bank\n';

describe('a ledger file', () => {
	it('is created, read, edited, moved and deleted', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const handle = ledger.handle;
			signIn(ownerOf(ledger));

			const created = await createFile({ handle, key: 'a.rupea', content: groceries });
			const read = await readFile({ handle, key: 'a.rupea' });
			expect(created.ok).toBe(true);
			expect(read.data).toMatchObject({ key: 'a.rupea', content: groceries });

			const version = read.data?.version ?? '';
			const edited = await editFile({ handle, key: 'a.rupea', content: groceries, version });
			const moved = await renameFiles({ handle, moves: [{ from: 'a.rupea', to: 'b.rupea' }] });
			expect(edited.ok).toBe(true);
			expect(moved).toMatchObject({ ok: true, data: [{ key: 'b.rupea' }] });

			expect(await listFiles(handle)).toMatchObject({ ok: true, data: [{ key: 'b.rupea' }] });
			expect(await deleteFiles({ handle, keys: ['b.rupea'] })).toMatchObject({ ok: true });
			expect(await listFiles(handle)).toMatchObject({ ok: true, data: [] });
		}));

	it('is out of reach before signing in', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(await listFiles(ledger.handle)).toEqual({
				ok: false,
				data: null,
				errors: [{ type: 'AuthUnauthenticated' }],
			});
		}));
});

describe('a draft', () => {
	it('is tidied and parsed without being saved', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			signIn(ownerOf(ledger));

			const formatted = await formatFile({
				content: '2026-08-29 Groceries\n  Expenses:Food 100\n  Assets:Bank',
			});
			const parsed = await parseFile({ key: 'a.rupea', content: groceries });
			expect(formatted.ok).toBe(true);
			expect(parsed).toMatchObject({ ok: true, data: [{ description: 'Groceries' }] });
		}));

	it('is added to the ledger, in the file its account was last added to', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const handle = ledger.handle;
			signIn(ownerOf(ledger));
			await createFile({ handle, key: 'hdfc.rupea', content: groceries });
			await createFile({ handle, key: '_/sep.rupea', content: groceries.replace('29', '30') });

			const latest = await findLatestFile({ handle, account: 'Assets:Bank' });
			const added = await addFile({ handle, from: '_/sep.rupea', to: latest.data ?? '' });
			expect(latest.data).toBe('hdfc.rupea');
			expect(added).toMatchObject({ ok: true, data: { added: 1, skipped: 0 } });
		}));
});
