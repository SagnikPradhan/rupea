import {
	createFile,
	deleteFiles,
	editFile,
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

			const created = await createFile({ handle, key: 'a.rupee', content: groceries });
			const read = await readFile({ handle, key: 'a.rupee' });
			expect(created.ok).toBe(true);
			expect(read.data).toMatchObject({ key: 'a.rupee', content: groceries });

			const version = read.data?.version ?? '';
			const edited = await editFile({ handle, key: 'a.rupee', content: groceries, version });
			const moved = await renameFiles({ handle, moves: [{ from: 'a.rupee', to: 'b.rupee' }] });
			expect(edited.ok).toBe(true);
			expect(moved).toMatchObject({ ok: true, data: [{ key: 'b.rupee' }] });

			expect(await listFiles(handle)).toMatchObject({ ok: true, data: [{ key: 'b.rupee' }] });
			expect(await deleteFiles({ handle, keys: ['b.rupee'] })).toMatchObject({ ok: true });
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
			const parsed = await parseFile({ key: 'a.rupee', content: groceries });
			expect(formatted.ok).toBe(true);
			expect(parsed).toMatchObject({ ok: true, data: [{ description: 'Groceries' }] });
		}));
});
