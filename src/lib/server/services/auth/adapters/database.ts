import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
	emailCodes,
	ledgers,
	memberships,
	sessions,
	users,
	type Role,
} from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result.ts';

export type User = { id: string; email: string; ledgerId: string | null };

export type Session = {
	tokenHash: string;
	userId: string;
	expiresAt: Date;
};

const userColumns = { id: users.id, email: users.email, ledgerId: users.ledgerId };

const sessionColumns = {
	tokenHash: sessions.tokenHash,
	userId: sessions.userId,
	expiresAt: sessions.expiresAt,
};

const OWNER: Role = 'owner';

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

export const createUser = (email: string): ResultAsync<User> =>
	withContext('db')((db) =>
		attempt(async () => {
			const user = { id: uuidv7(), email, ledgerId: uuidv7() };
			await db.transaction(async (tx) => {
				await tx.insert(ledgers).values({ id: user.ledgerId, name: 'Personal' });
				await tx.insert(users).values(user);
				await tx
					.insert(memberships)
					.values({ userId: user.id, ledgerId: user.ledgerId, role: OWNER });
			});
			return user;
		}),
	);

type SaveEmailCodeOptions = {
	email: string;
	codeHash: string;
	expiresAt: Date;
};

export const saveEmailCode = (options: SaveEmailCodeOptions): ResultAsync<void> => {
	const { email, codeHash, expiresAt } = options;
	return withContext('db')((db) =>
		attempt(() =>
			db
				.insert(emailCodes)
				.values({ email, codeHash, expiresAt })
				.onConflictDoUpdate({
					target: emailCodes.email,
					set: { codeHash, expiresAt },
				})
				.then(() => undefined),
		),
	);
};

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
		attempt(() =>
			db
				.insert(sessions)
				.values(s)
				.then(() => undefined),
		),
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
		attempt(() =>
			db
				.update(sessions)
				.set({ expiresAt })
				.where(eq(sessions.tokenHash, tokenHash))
				.then(() => undefined),
		),
	);

export const deleteSession = (tokenHash: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.delete(sessions)
				.where(eq(sessions.tokenHash, tokenHash))
				.then(() => undefined),
		),
	);
