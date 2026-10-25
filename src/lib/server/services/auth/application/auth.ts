import { withContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { sha256 } from '#lib/server/shared/hash.ts';
import { petName } from '#lib/server/shared/names.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import {
	err,
	errAsync,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as DB from '../adapters/database';
import {
	deleteSessionCookie,
	readSessionCookie,
	requestUser,
	setSessionCookie,
} from '../adapters/request';
import { codeMatches, newCode, newSession, sessionState } from '../domain/credentials';

export { normalizeEmail } from '../domain/credentials';

export type User = DB.User;

// A random username clashes rarely enough that a few tries settle it.
const TRIES = 5;

// Succeeds either way, so callers cannot tell which addresses have accounts.
export const requestCode = (email: string): ResultAsync<void> =>
	withContext('mailer')((mailer) =>
		canSignIn(email).andThen((allowed) => {
			if (!allowed) return okAsync();

			const fresh = newCode(Date.now());
			return DB.saveEmailCode({ email, ...fresh.stored }).andThen(() =>
				mailer.send({
					to: email,
					subject: `Your Rupea sign-in code: ${fresh.code}`,
					text: `Your sign-in code is ${fresh.code}. It expires in 10 minutes.`,
				}),
			);
		}),
	);

type SignInOptions = { email: string; code: string };

export const signIn = ({ email, code }: SignInOptions): ResultAsync<void> =>
	DB.takeEmailCode(email)
		.andThen((s) => (codeMatches(s, code, Date.now()) ? ok() : err(fault('AuthInvalidCode'))))
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
	return DB.findSession(tokenHash).andThen((found) => {
		if (!found) return okAsync(null);

		const user = found.user;
		const state = sessionState(found.session.expiresAt, Date.now());

		if (state.type === 'expired') return DB.deleteSession(tokenHash).map(() => null);
		if (state.type === 'valid') return okAsync({ user, expiresAt: found.session.expiresAt });
		return DB.extendSession(tokenHash, state.expiresAt).map(() => ({
			user,
			expiresAt: state.expiresAt,
		}));
	});
};

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
	return user ? okAsync(user).andThen(use) : errAsync(fault('AuthUnauthenticated'));
};

const canSignIn = (email: string): ResultAsync<boolean> =>
	withContext('config')((c) =>
		DB.findUserByEmail(email).andThen((u) =>
			u || c.accounts.signup === 'open' ? okAsync(true) : DB.countUsers().map((n) => n === 0),
		),
	);

const findOrCreateUser = (email: string): ResultAsync<User> =>
	DB.findUserByEmail(email).andThen((u) =>
		u
			? okAsync(u)
			: canSignIn(email).andThen((y) => (y ? signUp(email) : errAsync(fault('AuthInvalidCode')))),
	);

const signUp = (e: string): ResultAsync<User> =>
	createUser(e, TRIES).andThen((u) =>
		Ledger.createLedger({ user: u.id, name: 'Personal' }).map(() => u),
	);

const createUser = (v: string, n: number): ResultAsync<User> =>
	DB.createUser({ email: v, username: petName() }).orElse((e) =>
		e.type === 'NameTaken' && n > 1 ? createUser(v, n - 1) : errAsync(e),
	);
