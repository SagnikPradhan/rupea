import { provide, type RupeeContext } from '#lib/server/shared/context.ts';
import type { Mail, Mailer } from '#lib/server/shared/mailer.ts';
import { isHandle } from '#lib/server/shared/names.ts';
import { ok, okAsync } from '#lib/server/shared/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { createTemporaryDatabase } from '#tests/shared/database.ts';
import { it } from '#tests/shared/vitest.ts';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import * as DB from '../adapters/database';
import * as Auth from './auth';

type Cookie = { value: string; options: Record<string, unknown> };

const request = vi.hoisted(() => ({
	cookies: new Map<string, Cookie>(),
	locals: { user: null as Auth.User | null },
}));

vi.mock('$app/server', () => ({
	getRequestEvent: () => ({
		cookies: {
			get: (name: string) => request.cookies.get(name)?.value,
			set: (name: string, value: string, options: Record<string, unknown>) =>
				request.cookies.set(name, { value, options }),
			delete: (name: string) => request.cookies.delete(name),
		},
		locals: request.locals,
	}),
}));

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const inbox = () => {
	const sent: Mail[] = [];
	const mailer: Mailer = {
		send: (mail) => {
			sent.push(mail);
			return okAsync();
		},
	};
	return { sent, mailer };
};

const codeIn = (mail: Mail | undefined) => mail?.subject.match(/(\d{6})$/)?.[1] ?? '';

const signup = (context: RupeeContext, signup: 'open' | 'closed') => ({
	...context,
	config: { ...context.config, signup },
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

// Signs in through a mailed code, leaving the session in the cookie jar.
const signIn = (context: RupeeContext, email: string) => {
	const mail = inbox();
	return provide({ ...signup(context, 'open'), mailer: mail.mailer }, () =>
		Auth.requestCode(email).andThen(() => Auth.signIn(email, codeIn(mail.sent[0]))),
	);
};

beforeEach(() => {
	request.cookies.clear();
	request.locals.user = null;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('requesting a code', () => {
	it('mails a six-digit code to an existing user', ({ context }) =>
		provide(context, async () => {
			await DB.createUser({ email: 'known@example.com', username: 'known' });
			const mail = inbox();

			const sent = await provide({ ...context, mailer: mail.mailer }, () =>
				Auth.requestCode('known@example.com'),
			);

			expect(sent.isOk()).toBe(true);
			expect(mail.sent).toHaveLength(1);
			expect(mail.sent[0]?.to).toBe('known@example.com');
			expect(codeIn(mail.sent[0])).toMatch(/^\d{6}$/);
			expect(mail.sent[0]?.text).toContain(codeIn(mail.sent[0]));
		}));

	it('mails a stranger only while sign-up is open', ({ context }) =>
		provide(context, async () => {
			await DB.createUser({ email: 'someone@example.com', username: 'someone' });
			const closed = inbox();
			const open = inbox();

			const refused = await provide({ ...context, mailer: closed.mailer }, () =>
				Auth.requestCode('stranger@example.com'),
			);
			await provide({ ...signup(context, 'open'), mailer: open.mailer }, () =>
				Auth.requestCode('stranger@example.com'),
			);

			// Succeeds either way, so it does not reveal who has an account.
			expect(refused.isOk()).toBe(true);
			expect(closed.sent).toEqual([]);
			expect(open.sent).toHaveLength(1);
		}));

	it('lets the first user sign up while sign-up is closed', async ({ context }) => {
		const empty = await createTemporaryDatabase();
		const mail = inbox();

		await provide({ ...context, db: empty.orm, mailer: mail.mailer }, () =>
			Auth.requestCode('first@example.com'),
		);
		await empty.close();

		expect(mail.sent).toHaveLength(1);
	});
});

describe('signing in', () => {
	it('creates the user and starts a session in a secure cookie', ({ context }) =>
		provide(context, async () => {
			expect((await signIn(context, 'new@example.com')).isOk()).toBe(true);

			const cookie = request.cookies.get('session');
			expect(cookie?.options).toMatchObject({
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				expires: new Date(Date.now() + 30 * DAY),
			});
			const session = (await Auth.validateSession(cookie!.value)).unwrapOr(null);
			expect(session?.user.email).toBe('new@example.com');
		}));

	it('gives a new user a pet name and a ledger of their own', ({ context }) =>
		provide(context, async () => {
			await signIn(context, 'fresh@example.com');
			const user = (await DB.findUserByEmail('fresh@example.com'))._unsafeUnwrap();

			expect(isHandle(user?.username ?? '')).toBe(true);
			expect(await Ledger.listLedgers(user?.id ?? '')).toMatchObject(
				ok([{ name: 'Personal', owner: user?.id }]),
			);
		}));

	it('signs in an existing user while sign-up is closed', ({ context }) =>
		provide(context, async () => {
			await DB.createUser({ email: 'member@example.com', username: 'member' });
			const mail = inbox();
			await provide({ ...context, mailer: mail.mailer }, () =>
				Auth.requestCode('member@example.com'),
			);

			const signedIn = await Auth.signIn('member@example.com', codeIn(mail.sent[0]));

			expect(signedIn.isOk()).toBe(true);
			expect(request.cookies.has('session')).toBe(true);
		}));

	it('uses up a code on a wrong guess', ({ context }) =>
		provide(context, async () => {
			const mail = inbox();
			await provide({ ...signup(context, 'open'), mailer: mail.mailer }, () =>
				Auth.requestCode('guess@example.com'),
			);
			const code = codeIn(mail.sent[0]);
			const wrong = code === '000000' ? '000001' : '000000';

			const guessed = await Auth.signIn('guess@example.com', wrong);
			const retried = await Auth.signIn('guess@example.com', code);

			expect(guessed._unsafeUnwrapErr().type).toBe('AuthInvalidCode');
			expect(retried._unsafeUnwrapErr().type).toBe('AuthInvalidCode');
			expect(request.cookies.has('session')).toBe(false);
		}));

	it('refuses a code after ten minutes', ({ context }) =>
		provide(context, async () => {
			const mail = inbox();
			await provide({ ...signup(context, 'open'), mailer: mail.mailer }, () =>
				Auth.requestCode('slow@example.com'),
			);
			later(10 * MINUTE + 1);

			const signedIn = await Auth.signIn('slow@example.com', codeIn(mail.sent[0]));

			expect(signedIn._unsafeUnwrapErr().type).toBe('AuthInvalidCode');
		}));

	it('creates no user when sign-up closed after the code was sent', ({ context }) =>
		provide(context, async () => {
			await DB.createUser({ email: 'existing@example.com', username: 'existing' });
			const mail = inbox();
			await provide({ ...signup(context, 'open'), mailer: mail.mailer }, () =>
				Auth.requestCode('late@example.com'),
			);

			const signedIn = await Auth.signIn('late@example.com', codeIn(mail.sent[0]));

			expect(signedIn._unsafeUnwrapErr().type).toBe('AuthInvalidCode');
			expect((await DB.findUserByEmail('late@example.com')).unwrapOr(undefined)).toBeNull();
		}));
});

describe('validating a session', () => {
	it('knows nothing of an unknown token', ({ context }) =>
		provide(context, async () => {
			expect((await Auth.validateSession('unknown')).unwrapOr(undefined)).toBeNull();
		}));

	it('keeps a fresh session as it is', ({ context }) =>
		provide(context, async () => {
			await signIn(context, 'fresh@example.com');
			const cookie = request.cookies.get('session')!;
			later(14 * DAY);

			const session = (await Auth.validateSession(cookie.value)).unwrapOr(null);

			expect(session?.expiresAt).toEqual(cookie.options['expires']);
		}));

	it('renews a session past half its life, and remembers the renewal', ({ context }) =>
		provide(context, async () => {
			await signIn(context, 'renew@example.com');
			const token = request.cookies.get('session')!.value;
			later(16 * DAY);
			const renewed = new Date(Date.now() + 30 * DAY);

			const session = (await Auth.validateSession(token)).unwrapOr(null);
			later(20 * DAY);
			const again = (await Auth.validateSession(token)).unwrapOr(null);

			expect(session?.expiresAt).toEqual(renewed);
			expect(again?.user.email).toBe('renew@example.com');
		}));

	it('ends an expired session for good', ({ context }) =>
		provide(context, async () => {
			await signIn(context, 'expired@example.com');
			const token = request.cookies.get('session')!.value;
			later(30 * DAY + 1);

			expect((await Auth.validateSession(token)).unwrapOr(undefined)).toBeNull();

			vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
			expect((await Auth.validateSession(token)).unwrapOr(undefined)).toBeNull();
		}));
});

describe('signing out', () => {
	it('ends the session and drops the cookie', ({ context }) =>
		provide(context, async () => {
			await signIn(context, 'leaving@example.com');
			const token = request.cookies.get('session')!.value;

			expect((await Auth.signOut()).isOk()).toBe(true);

			expect(request.cookies.has('session')).toBe(false);
			expect((await Auth.validateSession(token)).unwrapOr(undefined)).toBeNull();
		}));

	it('succeeds without a session', ({ context }) =>
		provide(context, async () => {
			expect((await Auth.signOut()).isOk()).toBe(true);
		}));

	it('drops the cookie even when the session cannot be deleted', ({ context, db }) =>
		provide(context, async () => {
			await signIn(context, 'stuck@example.com');
			const token = request.cookies.get('session')!.value;
			const failing = vi.spyOn(db, 'delete').mockImplementation(() => {
				throw new Error('database down');
			});

			const signedOut = await Auth.signOut();
			failing.mockRestore();

			expect(signedOut.isOk()).toBe(true);
			expect(request.cookies.has('session')).toBe(false);
			expect((await Auth.validateSession(token)).unwrapOr(null)).not.toBeNull();
		}));
});

describe('acting as the current user', () => {
	it('refuses a request nobody signed in to', ({ context }) =>
		provide(context, async () => {
			const used = vi.fn(() => okAsync('done'));

			const result = await Auth.withCurrentUser(used);

			expect(result._unsafeUnwrapErr().type).toBe('AuthUnauthenticated');
			expect(used).not.toHaveBeenCalled();
		}));

	it('hands over the signed-in user', ({ context }) =>
		provide(context, async () => {
			const user = { id: 'u1', email: 'me@example.com', username: 'me' };
			request.locals.user = user;

			const result = await Auth.withCurrentUser((u) => okAsync(u.email));

			expect(result.unwrapOr(null)).toBe('me@example.com');
		}));
});
