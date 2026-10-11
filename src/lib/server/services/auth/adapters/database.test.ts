import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { storages } from '#lib/server/db/schema.ts';
import { provide } from '#lib/server/shared/context.ts';
import { ok } from '#lib/server/shared/result.ts';
import { it } from '#tests/shared/vitest.ts';
import * as Auth from './database';

const later = () => new Date(Date.now() + 60_000);

describe('the auth store', () => {
	it('hands over a sign-in code once', ({ context }) =>
		provide(context, async () => {
			const expiresAt = later();
			await Auth.saveEmailCode({ email: 'a@example.com', codeHash: 'one', expiresAt });
			await Auth.saveEmailCode({ email: 'a@example.com', codeHash: 'two', expiresAt });

			expect((await Auth.takeEmailCode('a@example.com')).unwrapOr(null)).toEqual({
				codeHash: 'two',
				expiresAt,
			});
			expect((await Auth.takeEmailCode('a@example.com')).unwrapOr(undefined)).toBeNull();
		}));

	it('creates a user with a storage of their own', ({ context, db }) =>
		provide(context, async () => {
			const user = (await Auth.createUser({ email: 'b@example.com', username: 'b' })).unwrapOr(
				null,
			);

			expect(user).toMatchObject({ email: 'b@example.com', username: 'b' });
			expect(await db.$count(storages, eq(storages.userId, user!.id))).toBe(1);
			expect((await Auth.findUserByEmail('b@example.com')).unwrapOr(null)).toEqual(user);
			expect((await Auth.findUserByEmail('nobody@example.com')).unwrapOr(undefined)).toBeNull();
		}));

	it('refuses a second user with the same email, and leaves no storage behind', ({ context, db }) =>
		provide(context, async () => {
			await Auth.createUser({ email: 'c@example.com', username: 'c' });
			const users = (await Auth.countUsers()).unwrapOr(-1);
			const stored = await db.$count(storages);

			expect((await Auth.createUser({ email: 'c@example.com', username: 'c2' })).isErr()).toBe(
				true,
			);
			expect((await Auth.countUsers()).unwrapOr(-1)).toBe(users);
			expect(await db.$count(storages)).toBe(stored);
		}));

	it('creates no user under a taken username', ({ context }) =>
		provide(context, async () => {
			await Auth.createUser({ email: 'e@example.com', username: 'e' });

			expect(await Auth.createUser({ email: 'f@example.com', username: 'e' })).toEqual(ok(null));
			expect((await Auth.findUserByEmail('f@example.com')).unwrapOr(undefined)).toBeNull();
		}));

	it('finds, extends and deletes a session', ({ context }) =>
		provide(context, async () => {
			const user = (await Auth.createUser({ email: 'd@example.com', username: 'd' })).unwrapOr(
				null,
			);
			const expiresAt = later();
			await Auth.createSession({ tokenHash: 'token', userId: user!.id, expiresAt });
			expect((await Auth.findSession('token')).unwrapOr(null)).toEqual({
				session: { tokenHash: 'token', userId: user!.id, expiresAt },
				user,
			});

			const extended = new Date(expiresAt.getTime() + 60_000);
			await Auth.extendSession('token', extended);
			expect((await Auth.findSession('token')).unwrapOr(null)?.session.expiresAt).toEqual(extended);

			await Auth.deleteSession('token');
			expect((await Auth.findSession('token')).unwrapOr(undefined)).toBeNull();
		}));
});
