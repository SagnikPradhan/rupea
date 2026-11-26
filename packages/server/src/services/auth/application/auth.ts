import { withContext } from '#lib/server/shared/context/context.ts';
import { sha256 } from '#lib/server/shared/hash.ts';
import { petName } from '#lib/server/shared/names.ts';
import { fault } from '@rupea/shared/errors.ts';
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
import { requestUser } from '../adapters/request';
import { codeMatches, newCode, newSession, sessionState } from '../domain/credentials';

export { runAs } from '../adapters/request';
export { normalizeEmail } from '../domain/credentials';

export type User = DB.User;

// A random username clashes rarely enough that a few tries settle it.
const TRIES = 5;

/** The address of the user local mode makes, which no mail ever reaches. */
const LOCAL_EMAIL = 'me@localhost';

/**
 * Mails a code that signs the address in, or confirms it for the user signed
 * in. Succeeds either way, so callers cannot tell which addresses have
 * accounts.
 */
export const requestCode = (email: string): ResultAsync<void> =>
	withContext('mailer')((mailer) =>
		mayMail(email).andThen((allowed) => {
			if (!allowed) return okAsync();

			const fresh = newCode(Date.now());
			return DB.saveEmailCode({ email, ...fresh.stored }).andThen(() =>
				mailer.send({
					to: email,
					subject: `Your Rupea code: ${fresh.code}`,
					text: `Your code is ${fresh.code}. It expires in 10 minutes.`,
				}),
			);
		}),
	);

type SignInOptions = { email: string; code: string };

export const signIn = ({
	email,
	code,
}: SignInOptions): ResultAsync<{ token: string; expiresAt: Date }> =>
	DB.takeEmailCode(email)
		.andThen((s) => (codeMatches(s, code, Date.now()) ? ok() : err(fault('AuthInvalidCode'))))
		.andThen(() => findOrCreateUser(email))
		.andThen((user) => {
			const session = newSession(Date.now());
			return DB.createSession({
				tokenHash: session.tokenHash,
				userId: user.id,
				expiresAt: session.expiresAt,
			}).map(() => ({ token: session.token, expiresAt: session.expiresAt }));
		});

/** A local session never expires, so it has no expiry. */
export type Session = { user: User; expiresAt: Date | null; extended: boolean };

export const validateSession = (token: string): ResultAsync<Session | null> => {
	const tokenHash = sha256(token);
	return DB.findSession(tokenHash).andThen((found) => {
		if (!found) return okAsync(null);

		const user = found.user;
		const state = sessionState(found.session.expiresAt, Date.now());

		if (state.type === 'expired') return DB.deleteSession(tokenHash).map(() => null);
		if (state.type === 'valid')
			return okAsync({ user, expiresAt: found.session.expiresAt, extended: false });
		return DB.extendSession(tokenHash, state.expiresAt).map(() => ({
			user,
			expiresAt: state.expiresAt,
			extended: true,
		}));
	});
};

export const findSession = (token: string): ResultAsync<Session | null> =>
	DB.findSession(sha256(token)).map((found) => {
		if (!found) return null;

		const expiresAt = found.session.expiresAt;
		return expiresAt.getTime() > Date.now()
			? { user: found.user, expiresAt, extended: false }
			: null;
	});

/** The session every call from this computer runs as when sign-in is off. */
export const findLocalSession = (): ResultAsync<Session | null> =>
	DB.findFirstUser().map((u) => u && { user: u, expiresAt: null, extended: false });

/**
 * Makes the one user local mode runs every call as, unless the database has it.
 * Fails when the database holds several, as it cannot tell whose it is.
 */
export const createLocalUser = (): ResultAsync<void> =>
	DB.countUsers().andThen((count) => {
		if (count > 1) return errAsync(fault('AuthManyLocalUsers', { count }));
		if (count === 1) return okAsync();

		return signUp(LOCAL_EMAIL).map(() => undefined);
	});

export const signOut = (t: string): ResultAsync<void> => DB.deleteSession(sha256(t));

export const withCurrentUser = <T>(
	use: (user: User) => Result<T> | ResultAsync<T>,
): ResultAsync<T> => {
	const user = requestUser();
	return user ? okAsync(user).andThen(use) : errAsync(fault('AuthUnauthenticated'));
};

type SaveUserOptions = {
	username?: string | undefined;
	email?: string | undefined;
	code?: string | undefined;
};

/**
 * Changes what is given of the user signed in. A new address needs the code
 * mailed to it, except with sign-in off, when no mail reaches anyone.
 */
export const saveUser = ({ username, email, code = '' }: SaveUserOptions): ResultAsync<User> =>
	withCurrentUser((u) =>
		confirmed({ email: email === u.email ? undefined : email, code }).andThen(() =>
			DB.saveUser(u.id, {
				...(username === undefined ? {} : { username }),
				...(email === undefined ? {} : { email }),
			}),
		),
	);

const confirmed = ({ email, code }: { email: string | undefined; code: string }) =>
	withContext('config')((c) => {
		if (email === undefined || c.accounts.signin === 'none') return okAsync();

		return DB.takeEmailCode(email).andThen((s) =>
			codeMatches(s, code, Date.now()) ? ok() : err(fault('AuthInvalidCode')),
		);
	});

const mayMail = (e: string): ResultAsync<boolean> => (requestUser() ? okAsync(true) : canSignIn(e));

const canSignIn = (email: string): ResultAsync<boolean> =>
	withContext('config')((c) => {
		if (c.accounts.signin === 'none') return okAsync(false);

		return DB.findUserByEmail(email).andThen((u) =>
			u || c.accounts.signup === 'open' ? okAsync(true) : DB.countUsers().map((n) => n === 0),
		);
	});

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
