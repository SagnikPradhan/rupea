import * as PG from 'drizzle-orm/pg-core';
import { base } from '#lib/server/db/columns.ts';
import { StorageKind } from '#lib/server/shared/storage/storage.ts';
import { users } from '#services/auth/adapters/database-schema.ts';

export const storageKind = PG.pgEnum('storage_kind', StorageKind);

// One per user for now: where their schemas and the ledgers they own live.
export const storages = PG.pgTable('storages', (t) => ({
	...base,
	userId: t
		.uuid()
		.notNull()
		.unique('storages_user_id_unique')
		.references(() => users.id, { onDelete: 'cascade' }),
	kind: storageKind().notNull(),
}));
