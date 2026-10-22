import { count } from '#tests/shared/count.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { createUser } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import * as Storage from '#services/storage/application/storage.ts';

describe("a user's storage", () => {
	it('is made on first use, once, however many ask at a time', ({ context, db }) =>
		provide(context, async () => {
			const user = (await createUser(db)).userId;
			await db.deleteFrom('storages').where('userId', '=', user).execute();

			const made = await Promise.all([Storage.ensureStorage(user), Storage.ensureStorage(user)]);

			expect(made[0]).toEqual(made[1]);
			expect(await count(db.selectFrom('storages').where('userId', '=', user))).toBe(1);
		}));

	it("is opened at the user's own place", ({ context, db, storage }) =>
		provide(context, async () => {
			const user = (await createUser(db)).userId;
			await Storage.withStorage({
				user,
				action: (s) => s.write({ key: 'a.txt', content: new TextEncoder().encode('hi') }),
			});

			expect((await storage.read(`users/${user}/a.txt`)).isOk()).toBe(true);
		}));
});
