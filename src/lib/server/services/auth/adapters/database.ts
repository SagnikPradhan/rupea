import { violatesUnique } from '#lib/server/db/index.ts';
import { emailCodes, sessions, StorageKind, storages, users } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { unknownError, type RupeeError } from '#lib/server/shared/error.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result.ts';
import { eq } from 'drizzle-orm';

export type User = { id: string; email: string; username: string };

export type Session = {
	tokenHash: string;
	userId: string;
	expiresAt: Date;
};

const userColumns = {
	id: users.id,
	email: users.email,
	username: users.username,
};

const sessionColumns = {
	tokenHash: sessions.tokenHash,
	userId: sessions.userId,
	expiresAt: sessions.expiresAt,
};

export const findUserByEmail = (email: string): ResultAsync<User | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(userColumns)
				.from(users)
				.where(eq(users.email, email))
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const countUsers = (): ResultAsync<number> =>
	withContext('db')((db) => attempt(() => db.$count(users)));

type CreateUserOptions = {
	email: string;
	username: string;
};

// Every user gets a storage, where their schemas live.
export const createUser = (options: CreateUserOptions): ResultAsync<User> =>
	withContext('db')((db) =>
		attempt({
			try: () =>
				db.transaction(async (tx) => {
					const user = await tx
						.insert(users)
						.values(options)
						.returning(userColumns)
						.then(([u]) => u ?? Promise.reject(new Error(`${options.email} was not saved`)));
					await tx.insert(storages).values({ userId: user.id, kind: StorageKind.Local });
					return user;
				}),
			catch: (t) => usernameTaken(options.username, t),
		}),
	);

const usernameTaken = (u: string, t: unknown): RupeeError =>
	violatesUnique(t, 'users_username_unique')
		? { type: 'NameTaken', name: u, cause: [] }
		: unknownError(t);

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
			await db.insert(emailCodes).values({ email, codeHash, expiresAt }).onConflictDoUpdate({
				target: emailCodes.email,
				set: { codeHash, expiresAt },
			});
		}),
	);

export const takeEmailCode = (
	email: string,
): ResultAsync<{ codeHash: string; expiresAt: Date } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.delete(emailCodes)
				.where(eq(emailCodes.email, email))
				.returning({ codeHash: emailCodes.codeHash, expiresAt: emailCodes.expiresAt })
				.then(([t]) => t ?? null),
		),
	);

export const createSession = (s: Session): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.insert(sessions).values(s);
		}),
	);

export const findSession = (
	tokenHash: string,
): ResultAsync<{ session: Session; user: User } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ session: sessionColumns, user: userColumns })
				.from(sessions)
				.innerJoin(users, eq(users.id, sessions.userId))
				.where(eq(sessions.tokenHash, tokenHash))
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const extendSession = (tokenHash: string, expiresAt: Date): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash));
		}),
	);

export const deleteSession = (tokenHash: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
		}),
	);
