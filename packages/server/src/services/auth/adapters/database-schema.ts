import * as PG from 'drizzle-orm/pg-core';
import { base } from '#lib/server/db/columns.ts';

export const users = PG.pgTable('users', (t) => ({
	...base,
	email: t.text().notNull().unique(),
	username: t.text().notNull().unique('users_username_unique'),
}));

export const sessions = PG.pgTable('sessions', (t) => ({
	...base,
	expiresAt: t.timestamp({ withTimezone: true }).notNull(),
	tokenHash: t.text().notNull().unique('sessions_token_hash_unique'),
	userId: t
		.uuid()
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
}));

export const emailCodes = PG.pgTable('email_codes', (t) => ({
	...base,
	email: t.text().notNull().unique(),
	codeHash: t.text().notNull(),
	expiresAt: t.timestamp({ withTimezone: true }).notNull(),
}));
