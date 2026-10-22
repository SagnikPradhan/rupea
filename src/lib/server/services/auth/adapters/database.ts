import { attemptWrite, violates } from '#lib/server/db/errors.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';

export type User = { id: string; email: string; username: string };

export type Session = {
	tokenHash: string;
	userId: string;
	expiresAt: Date;
};

const userColumns = ['users.id', 'users.email', 'users.username'] as const;

const sessionColumns = ['sessions.tokenHash', 'sessions.userId', 'sessions.expiresAt'] as const;

export const findUserByEmail = (email: string): ResultAsync<User | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('users')
				.select(userColumns)
				.where('email', '=', email)
				.executeTakeFirst()
				.then((f) => f ?? null),
		),
	);

export const countUsers = (): ResultAsync<number> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('users')
				.select((e) => e.fn.countAll<number>().as('count'))
				.executeTakeFirstOrThrow()
				.then((r) => Number(r.count)),
		),
	);

type CreateUserOptions = {
	email: string;
	username: string;
};

export const createUser = (options: CreateUserOptions): ResultAsync<User> =>
	withContext('db')((db) =>
		attemptWrite(() =>
			db.insertInto('users').values(options).returning(userColumns).executeTakeFirstOrThrow(),
		).mapErr((e) =>
			violates(e, 'users_username_unique') ? fault('NameTaken', { name: options.username }) : e,
		),
	);

type SaveEmailCodeOptions = {
	email: string;
	codeHash: string;
	expiresAt: Date;
};

export const saveEmailCode = ({
	email,
	codeHash,
	expiresAt,
}: SaveEmailCodeOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insertInto('emailCodes')
				.values({ email, codeHash, expiresAt })
				.onConflict((o) => o.column('email').doUpdateSet({ codeHash, expiresAt }))
				.execute();
		}),
	);

export const takeEmailCode = (
	email: string,
): ResultAsync<{ codeHash: string; expiresAt: Date } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.deleteFrom('emailCodes')
				.where('email', '=', email)
				.returning(['codeHash', 'expiresAt'])
				.executeTakeFirst()
				.then((t) => t ?? null),
		),
	);

export const createSession = (s: Session): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.insertInto('sessions').values(s).execute();
		}),
	);

export const findSession = (
	tokenHash: string,
): ResultAsync<{ session: Session; user: User } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('sessions')
				.innerJoin('users', 'users.id', 'sessions.userId')
				.select([...sessionColumns, ...userColumns])
				.where('sessions.tokenHash', '=', tokenHash)
				.executeTakeFirst()
				.then((f) =>
					f
						? {
								session: { tokenHash: f.tokenHash, userId: f.userId, expiresAt: f.expiresAt },
								user: { id: f.id, email: f.email, username: f.username },
							}
						: null,
				),
		),
	);

export const extendSession = (tokenHash: string, expiresAt: Date): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.updateTable('sessions')
				.set({ expiresAt })
				.where('tokenHash', '=', tokenHash)
				.execute();
		}),
	);

export const deleteSession = (tokenHash: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.deleteFrom('sessions').where('tokenHash', '=', tokenHash).execute();
		}),
	);
