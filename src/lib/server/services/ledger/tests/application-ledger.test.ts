import { provide } from '#lib/server/shared/context/context.ts';
import { isHandle, petName } from '#lib/server/shared/names.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { createLedger, createUser } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { afterEach, describe, expect, vi } from 'vitest';
import { groceries, stored } from './fixtures/files';

vi.mock(import('#lib/server/shared/names.ts'), async (original) => {
	const names = await original();
	return { ...names, petName: vi.fn(names.petName) };
});

afterEach(() => {
	vi.mocked(petName).mockReset();
});

describe('reaching a ledger', () => {
	it('lets its owner and its members in, and no one else', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const member = await createUser(db);
			const stranger = await createUser(db);
			await db
				.insertInto('memberships')
				.values({ userId: member.userId, ledgerId: ledger.id })
				.execute();
			const reach = (user: string) =>
				Ledger.withLedger({ user, handle: ledger.handle, action: (l) => ok(l) });

			expect(await reach(ledger.owner)).toEqual(ok(ledger));
			expect(await reach(member.userId)).toEqual(ok(ledger));
			expect(await reach(stranger.userId)).toEqual(
				err({ type: 'LedgerNotFound', handle: ledger.handle }),
			);
		}));

	it('lists the ledgers a user owns and those shared with them', ({ context, db }) =>
		provide(context, async () => {
			const own = await createLedger(db);
			const shared = await createLedger(db);
			await createLedger(db);
			await db
				.insertInto('memberships')
				.values({ userId: own.owner, ledgerId: shared.id })
				.execute();

			expect(await Ledger.listLedgers({ user: own.owner })).toEqual(ok([own, shared]));
		}));

	it("creates a ledger under a fresh handle, in its owner's storage", ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const created = (await Ledger.createLedger({ user: userId, name: 'Home' }))._unsafeUnwrap();
			await Files.createFile({ ledger: created, key: 'a.rupea', content: groceries });

			expect(created).toMatchObject({ name: 'Home', owner: userId });
			expect(isHandle(created.handle)).toBe(true);
			expect((await stored(storage, created).read('a.rupea')).isOk()).toBe(true);
		}));

	it('tries another handle when one is taken, and gives up after a few', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			vi.mocked(petName).mockReturnValueOnce('quiet-heron');
			await Ledger.createLedger({ user: userId, name: 'Home' });
			vi.mocked(petName).mockReturnValueOnce('quiet-heron').mockReturnValueOnce('brave-otter');

			expect(await Ledger.createLedger({ user: userId, name: 'Work' })).toMatchObject(
				ok({ handle: 'brave-otter', name: 'Work' }),
			);

			vi.mocked(petName).mockReturnValue('quiet-heron');
			expect(await Ledger.createLedger({ user: userId, name: 'Away' })).toEqual(
				err({ type: 'NameTaken', name: 'quiet-heron' }),
			);
		}));
});
