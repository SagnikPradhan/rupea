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
import { deleteSessionCookie, readSessionCookie, setSessionCookie } from '../adapters/cookie';
import * as DB from '../adapters/database';
import { requestUser } from '../adapters/locals';
import { codeMatches, newCode, newSession, sessionState, sha256 } from '../domain/credentials';

export { normalizeEmail } from '../domain/credentials';

export type User = DB.User;

const canSignIn = (email: string): ResultAsync<boolean> =>
	withContext('config')((c) =>
		DB.findUserByEmail(email).andThen((u) =>
			u || c.signup === 'open' ? okAsync(true) : DB.countUsers().map((n) => n === 0),
		),
	);

// Succeeds either way, so callers cannot tell which addresses have accounts.
export const requestCode = (email: string): ResultAsync<void> =>
	withContext('mailer')((mailer) =>
		canSignIn(email).andThen((allowed): ResultAsync<void> => {
			if (!allowed) return okAsync();

			const fresh = newCode(Date.now());
			return DB.saveEmailCode({ email, ...fresh.stored }).andThen(() =>
				mailer.send({
					to: email,
					subject: `Your Rupee sign-in code: ${fresh.code}`,
					text: `Your sign-in code is ${fresh.code}. It expires in 10 minutes.`,
				}),
			);
		}),
	);

// Sign-up may have closed since the code was sent.
const findOrCreateUser = (email: string): ResultAsync<User> =>
	DB.findUserByEmail(email).andThen((existing) =>
		existing
			? okAsync(existing)
			: canSignIn(email).andThen((a): ResultAsync<User> =>
					a ? DB.createUser(email) : errAsync({ type: 'AuthInvalidCode', cause: [] }),
				),
	);

// A code works once: it is consumed whether or not it matches.
export const signIn = (email: string, code: string): ResultAsync<void> =>
	DB.takeEmailCode(email)
		.andThen((s): Result<void> =>
			codeMatches(s, code, Date.now()) ? ok() : err({ type: 'AuthInvalidCode', cause: [] }),
		)
		.andThen(() => findOrCreateUser(email))
		.andThen((user) => {
			const session = newSession(Date.now());
			return DB.createSession({
				tokenHash: session.tokenHash,
				userId: user.id,
				expiresAt: session.expiresAt,
			}).map(() => setSessionCookie(session.token, session.expiresAt));
		});

export const validateSession = (
	token: string,
): ResultAsync<{ user: User; expiresAt: Date } | null> => {
	const tokenHash = sha256(token);
	return DB.findSession(tokenHash).andThen(
		(found): ResultAsync<{ user: User; expiresAt: Date } | null> => {
			if (!found) return okAsync(null);

			const user = found.user;
			const state = sessionState(found.session.expiresAt, Date.now());
			if (state.type === 'expired') return DB.deleteSession(tokenHash).map(() => null);
			if (state.type === 'valid') return okAsync({ user, expiresAt: found.session.expiresAt });
			return DB.extendSession(tokenHash, state.expiresAt).map(() => ({
				user,
				expiresAt: state.expiresAt,
			}));
		},
	);
};

// The cookie goes whether or not the session could be deleted.
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

export const withCurrentUser = <T>(
	use: (user: User) => Result<T> | ResultAsync<T>,
): ResultAsync<T> => {
	const user = requestUser();
	return user ? okAsync(user).andThen(use) : errAsync({ type: 'AuthUnauthenticated', cause: [] });
};
