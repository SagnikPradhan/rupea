import { sql } from 'drizzle-orm';
import * as PG from 'drizzle-orm/pg-core';

/** The columns every table spreads. */
export const base = {
	id: PG.uuid()
		.primaryKey()
		.default(sql`uuidv7()`),
	createdAt: PG.timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: PG.timestamp({ withTimezone: true }).notNull().defaultNow(),
};
