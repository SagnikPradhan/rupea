import { users } from '#services/auth/adapters/database-schema.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { provide, withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync } from '#lib/server/shared/result/result.ts';
import { it } from '#tests/shared/vitest.ts';
import { eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect } from 'vitest';

const insertUser = (id: string) =>
	withContext('db')((db) =>
		attempt(() => db.insert(users).values({ id, email: `${id}@example.com`, username: id })),
	);

describe('a transaction', () => {
	it('keeps every write when it succeeds', ({ context, db }) =>
		provide(context, async () => {
			const [a, b] = [uuidv7(), uuidv7()];

			const done = await atomically(() => insertUser(a).andThen(() => insertUser(b)));

			expect(done.isOk()).toBe(true);
			expect(await db.$count(users, inArray(users.id, [a, b]))).toBe(2);
		}));

	it('keeps no write when it fails, and hands back the error', ({ context, db }) =>
		provide(context, async () => {
			const id = uuidv7();
			const failure = fault('LedgerNotFound', { handle: 'nowhere' });

			const done = await atomically(() => insertUser(id).andThen(() => errAsync(failure)));

			expect(done._unsafeUnwrapErr()).toEqual(failure);
			expect(await db.$count(users, eq(users.id, id))).toBe(0);
		}));

	it('turns a throw into an unknown error', ({ context }) =>
		provide(context, async () => {
			const done = await atomically(() => attempt(() => Promise.reject(new Error('boom'))));

			expect(done._unsafeUnwrapErr()).toEqual(fault('UnknownError', { message: 'boom' }));
		}));
});
