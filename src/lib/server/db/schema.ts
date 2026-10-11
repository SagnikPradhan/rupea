import { sql } from 'drizzle-orm';
import * as PG from 'drizzle-orm/pg-core';

export const EMBEDDING_DIMENSIONS = 384;

const base = {
	id: PG.uuid()
		.primaryKey()
		.default(sql`uuidv7()`),
	createdAt: PG.timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: PG.timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export type Role = (typeof roles)[number];
export const roles = ['owner'] as const;
export const role = PG.pgEnum('role', roles);

export const priceKinds = ['unit', 'total'] as const;
export const priceKind = PG.pgEnum('price_kind', priceKinds);

export const ledgers = PG.pgTable('ledgers', (t) => ({
	...base,
	name: t.text().notNull(),
}));

export const users = PG.pgTable('users', (t) => ({
	...base,
	email: t.text().notNull().unique(),
	ledgerId: t.uuid().references(() => ledgers.id, { onDelete: 'set null' }),
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
	email: t.text().notNull().unique(),
	codeHash: t.text().notNull(),
	expiresAt: t.timestamp({ withTimezone: true }).notNull(),
}));

export const memberships = PG.pgTable(
	'memberships',
	(t) => ({
		...base,
		role: role().notNull(),
		userId: t
			.uuid()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
	}),
	(t) => [PG.unique('memberships_user_id_ledger_id').on(t.userId, t.ledgerId)],
);

export const ledgerFiles = PG.pgTable(
	'ledger_files',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		key: t.text().notNull(),
		version: t.text(),
	}),
	(t) => [PG.unique('ledger_files_ledger_id_key').on(t.ledgerId, t.key)],
);

export const transactions = PG.pgTable(
	'transactions',
	(t) => ({
		...base,
		fileId: t
			.uuid()
			.notNull()
			.references(() => ledgerFiles.id, { onDelete: 'cascade' }),
		line: t.integer().notNull(),
		date: t.date().notNull(),
		time: t.time(),
		description: t.text().notNull(),
	}),
	(t) => [
		PG.index('transactions_file_id').on(t.fileId),
		PG.index('transactions_description_trgm').using('gin', t.description.op('gin_trgm_ops')),
	],
);

export const postings = PG.pgTable(
	'postings',
	(t) => ({
		...base,
		transactionId: t
			.uuid()
			.notNull()
			.references(() => transactions.id, { onDelete: 'cascade' }),
		position: t.integer().notNull(),
		account: t.text().notNull(),
		amount: t.bigint({ mode: 'bigint' }).notNull(), // signed millionths
		commodity: t.text().notNull(),
		priceAmount: t.bigint({ mode: 'bigint' }), // price fields: all or none
		priceCommodity: t.text(),
		priceKind: priceKind(), // `@` unit, `@@` total
		balance: t.bigint({ mode: 'bigint' }),
	}),
	(t) => [
		PG.index('postings_transaction_id').on(t.transactionId),
		PG.index('postings_account_amount').on(t.account, t.commodity, t.amount),
		PG.index('postings_account_prefix').on(t.account.op('text_pattern_ops')),
		PG.index('postings_account_trgm').using('gin', t.account.op('gin_trgm_ops')),
		PG.index('postings_balance')
			.on(t.account, t.commodity)
			.where(sql`${t.balance} IS NOT NULL`),
	],
);

export const metadata = PG.pgTable(
	'metadata',
	(t) => ({
		...base,
		fileId: t.uuid().references(() => ledgerFiles.id, { onDelete: 'cascade' }),
		transactionId: t.uuid().references(() => transactions.id, { onDelete: 'cascade' }),
		postingId: t.uuid().references(() => postings.id, { onDelete: 'cascade' }),
		position: t.integer().notNull(),
		key: t.text().notNull(),
		value: t.text().notNull(),
	}),
	(t) => [
		PG.index('metadata_file_id').on(t.fileId),
		PG.index('metadata_transaction_id').on(t.transactionId),
		PG.index('metadata_posting_id').on(t.postingId),
		PG.index('metadata_key_value').on(t.key, t.value),
		PG.check(
			'metadata_one_owner',
			sql`num_nonnulls(${t.fileId}, ${t.transactionId}, ${t.postingId}) = 1`,
		),
	],
);

export const dismissedMatches = PG.pgTable(
	'dismissed_matches',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		fingerprint: t.text().notNull(), // declined suggestion pair
	}),
	(t) => [PG.unique('dismissed_matches_ledger_id_fingerprint').on(t.ledgerId, t.fingerprint)],
);

export const embeddings = PG.pgTable(
	'embeddings',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		model: t.text().notNull(),
		text: t.text().notNull(),
		vector: t.vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
	}),
	(t) => [
		PG.unique('embeddings_ledger_id_model_text').on(t.ledgerId, t.model, t.text),
		PG.index('embeddings_vector').using('hnsw', t.vector.op('vector_cosine_ops')),
	],
);
