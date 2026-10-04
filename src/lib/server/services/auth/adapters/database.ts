/**
 * Outbound persistence adapter for accounts, sign-in codes and sessions.
 * Every query runs through `attempt`, so a database failure comes back as a
 * `RupeeError` rather than a throw.
 */
import type { Enum } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result.ts';

export type User = { id: string; email: string; ledgerId: string | null };

export type Session = {
	/** SHA-256 of the cookie token. */
	tokenHash: string;
	userId: string;
	expiresAt: Date;
};

const userFields = ['id', 'email', 'ledgerId'] as const;

const sessionFields = ['tokenHash', 'userId', 'expiresAt'] as const;

const OWNER: Enum<'Role'> = 'owner';

export const findUserByEmail = (email: string): ResultAsync<User | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db.orm.User.select(...userFields)
				.where({ email })
				.first(),
		),
	);

export const countUsers = (): ResultAsync<number> =>
	withContext('db')((db) =>
		attempt(() => db.orm.User.aggregate((a) => ({ users: a.count() })).then(({ users }) => users)),
	);

/**
 * Create a user together with their first ledger, which they own and start
 * out in.
 */
export const createUser = (email: string): ResultAsync<User> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				const ledger = await tx.orm.Ledger.create({ name: 'Personal' });
				const user = await tx.orm.User.select(...userFields).create({
					email,
					ledgerId: ledger.id,
				});
				await tx.orm.Membership.create({
					userId: user.id,
					ledgerId: ledger.id,
					role: OWNER,
				});
				return user;
			}),
		),
	);

type SaveEmailCodeOptions = {
	email: string;
	codeHash: string;
	expiresAt: Date;
};

/** Store the outstanding code for `email`, replacing any earlier one. */
export const saveEmailCode = (options: SaveEmailCodeOptions): ResultAsync<void> => {
	const { email, codeHash, expiresAt } = options;
	return withContext('db')((db) =>
		attempt(() =>
			db.orm.EmailCode.upsert({
				create: { email, codeHash, expiresAt },
				update: { codeHash, expiresAt },
				conflictOn: { email },
			}).then(() => undefined),
		),
	);
};

/** Remove and return the outstanding code for `email`, if any. */
export const takeEmailCode = (
	email: string,
): ResultAsync<{ codeHash: string; expiresAt: Date } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				const code = await tx.orm.EmailCode.select('codeHash', 'expiresAt')
					.where({ email })
					.first();
				if (code) await tx.orm.EmailCode.where({ email }).delete();
				return code;
			}),
		),
	);

export const createSession = (s: Session): ResultAsync<void> =>
	withContext('db')((db) => attempt(() => db.orm.Session.create(s).then(() => undefined)));

export const findSession = (
	tokenHash: string,
): ResultAsync<{ session: Session; user: User } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db.orm.Session.select(...sessionFields)
				.where({ tokenHash })
				.include('user', (u) => u.select(...userFields))
				.first()
				.then((found) => {
					if (!found) return null;
					const { user, ...session } = found;
					return user ? { session, user } : null;
				}),
		),
	);

export const extendSession = (tokenHash: string, expiresAt: Date): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db.orm.Session.where({ tokenHash })
				.update({ expiresAt })
				.then(() => undefined),
		),
	);

export const deleteSession = (tokenHash: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db.orm.Session.where({ tokenHash })
				.delete()
				.then(() => undefined),
		),
	);
