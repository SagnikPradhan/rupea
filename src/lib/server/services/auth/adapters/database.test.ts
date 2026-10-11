import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context.ts';
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

	it('creates a user with a ledger they own and work in', ({ context }) =>
		provide(context, async () => {
			const user = (await Auth.createUser('b@example.com')).unwrapOr(null);

			expect(user?.ledgerId).toBeTruthy();
			expect((await Auth.findUserByEmail('b@example.com')).unwrapOr(null)).toEqual(user);
			expect((await Auth.findUserByEmail('nobody@example.com')).unwrapOr(undefined)).toBeNull();
		}));

	it('refuses a second user with the same email, and leaves no ledger behind', ({ context }) =>
		provide(context, async () => {
			await Auth.createUser('c@example.com');
			const before = (await Auth.countUsers()).unwrapOr(-1);

			expect((await Auth.createUser('c@example.com')).isErr()).toBe(true);
			expect((await Auth.countUsers()).unwrapOr(-1)).toBe(before);
		}));

	it('finds, extends and deletes a session', ({ context }) =>
		provide(context, async () => {
			const user = (await Auth.createUser('d@example.com')).unwrapOr(null);
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
