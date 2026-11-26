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

export const saveUsername = (n: string): ResultAsync<User> =>
	withCurrentUser((u) => DB.saveUser(u.id, { username: n }));

/**
 * Fails before mailing an address another user has, as it could not be moved
 * to.
 */
export const requestEmailCode = (email: string): ResultAsync<void> =>
	withContext('mailer')((mailer) =>
		withCurrentUser(() =>
			DB.findUserByEmail(email).andThen((taken) => {
				if (taken) return errAsync(fault('EmailTaken', { email }));

				const fresh = newCode(Date.now());
				return DB.saveEmailCode({ email, ...fresh.stored }).andThen(() =>
					mailer.send({
						to: email,
						subject: `Your Rupea code to change your email: ${fresh.code}`,
						text: `Your code is ${fresh.code}. It expires in 10 minutes.`,
					}),
				);
			}),
		),
	);

type SaveEmailOptions = { email: string; code: string };

/** With sign-in off no mail reaches anyone, so the address is taken as given. */
export const saveEmail = ({ email, code }: SaveEmailOptions): ResultAsync<User> =>
	withContext('config')((c) =>
		withCurrentUser((u) => {
			const checked =
				c.accounts.signin === 'none'
					? okAsync()
					: DB.takeEmailCode(email).andThen((s) =>
							codeMatches(s, code, Date.now()) ? ok() : err(fault('AuthInvalidCode')),
						);
			return checked.andThen(() => DB.saveUser(u.id, { email }));
		}),
	);

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
