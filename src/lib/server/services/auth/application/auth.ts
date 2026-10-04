/**
 * Passwordless sign-in. A user asks for a code by email, then trades it for a
 * session. Signing in and signing up are the same flow: an unknown email gets
 * an account (and its first ledger) when sign-up is allowed.
 *
 * Codes and session tokens are only ever stored as SHA-256 hashes.
 */
import { withContext } from '#lib/server/shared/context.ts';
import { withLogger } from '#lib/server/shared/logger.ts';
import {
	err,
	errAsync,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result.ts';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { deleteSessionCookie, readSessionCookie, setSessionCookie } from '../adapters/cookie';
import * as DB from '../adapters/database';
import { requestUser } from '../adapters/locals';

const CODE_LIFETIME = 10 * 60 * 1000;
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEWAL = 15 * 24 * 60 * 60 * 1000;

export type User = DB.User;

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

const canSignIn = (email: string): ResultAsync<boolean> =>
	withContext('config')((c) =>
		DB.findUserByEmail(email).andThen((u) =>
			u || c.signup === 'open' ? okAsync(true) : DB.countUsers().map((n) => n === 0),
		),
	);

/**
 * Email a sign-in code to `email` if it can sign in. Succeeds either way, so
 * the caller cannot tell which addresses have accounts.
 */
export const requestCode = (email: string): ResultAsync<void> =>
	withContext('mailer')((mailer) =>
		canSignIn(email).andThen((allowed): ResultAsync<void> => {
			if (!allowed) return okAsync();

			const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
			return DB.saveEmailCode({
				email,
				codeHash: sha256(code),
				expiresAt: new Date(Date.now() + CODE_LIFETIME),
			}).andThen(() =>
				mailer.send({
					to: email,
					subject: `Your Rupee sign-in code: ${code}`,
					text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
				}),
			);
		}),
	);

type NewSession = { token: string; expiresAt: Date };

/** Whether `code` matches the unexpired `stored` code. */
const matches = (stored: { codeHash: string; expiresAt: Date } | null, code: string): boolean => {
	if (!stored || stored.expiresAt.getTime() < Date.now()) return false;
	const expected = Buffer.from(stored.codeHash);
	const actual = Buffer.from(sha256(code));
	return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/**
 * The account for `email`, created if it has none. Sign-up may have closed
 * since the code was sent, in which case the code is no good.
 */
const findOrCreateUser = (email: string): ResultAsync<User> =>
	DB.findUserByEmail(email).andThen((existing) =>
		existing
			? okAsync(existing)
			: canSignIn(email).andThen((a): ResultAsync<User> =>
					a ? DB.createUser(email) : errAsync({ type: 'AuthInvalidCode', cause: [] }),
				),
	);

/**
 * Trade a code for a session, creating the account first if this is a new
 * email. A code works once: it is consumed whether or not it matches.
 */
const verifyCode = (email: string, code: string): ResultAsync<NewSession> =>
	DB.takeEmailCode(email)
		.andThen((s): Result<void> =>
			matches(s, code) ? ok() : err({ type: 'AuthInvalidCode', cause: [] }),
		)
		.andThen(() => findOrCreateUser(email))
		.andThen((user) => {
			const token = randomBytes(32).toString('base64url');
			const expiresAt = new Date(Date.now() + SESSION_LIFETIME);
			return DB.createSession({
				tokenHash: sha256(token),
				userId: user.id,
				expiresAt,
			}).map(() => ({ token, expiresAt }));
		});

/**
 * Trade a code for a session and start it: the session cookie is set on the
 * current request.
 */
export const signIn = (em: string, cd: string): ResultAsync<void> =>
	verifyCode(em, cd).map(({ token, expiresAt }) => {
		setSessionCookie(token, expiresAt);
	});

/**
 * The user behind a session token, or `null` if the session is unknown or
 * expired. A session in the second half of its lifetime is extended, and the
 * new expiry returned so the cookie can follow.
 */
export const validateSession = (
	token: string,
): ResultAsync<{ user: User; expiresAt: Date } | null> => {
	const tokenHash = sha256(token);
	return DB.findSession(tokenHash).andThen(
		(found): ResultAsync<{ user: User; expiresAt: Date } | null> => {
			if (!found) return okAsync(null);

			const { session, user } = found;
			const now = Date.now();
			if (session.expiresAt.getTime() <= now) return DB.deleteSession(tokenHash).map(() => null);
			if (session.expiresAt.getTime() - now >= SESSION_RENEWAL)
				return okAsync({ user, expiresAt: session.expiresAt });

			const expiresAt = new Date(now + SESSION_LIFETIME);
			return DB.extendSession(tokenHash, expiresAt).map(() => ({
				user,
				expiresAt,
			}));
		},
	);
};

/**
 * End the current request's session. The cookie goes whether or not the
 * session could be deleted; a failure is logged, not reported.
 */
export const signOut = (): ResultAsync<void> => {
	const token = readSessionCookie();
	const deleted = token ? DB.deleteSession(sha256(token)) : okAsync();
	return deleted
		.orElse((error) => {
			withLogger('auth')((l) => l.error({ error }, 'sign-out failed'));
			return ok();
		})
		.map(() => {
			deleteSessionCookie();
		});
};

/**
 * Run `use` for the signed-in user of the current request; fails with
 * `AuthUnauthenticated` when nobody is signed in.
 */
export const withCurrentUser = <T>(
	use: (user: User) => Result<T> | ResultAsync<T>,
): ResultAsync<T> => {
	const user = requestUser();
	return user ? okAsync(user).andThen(use) : errAsync({ type: 'AuthUnauthenticated', cause: [] });
};
