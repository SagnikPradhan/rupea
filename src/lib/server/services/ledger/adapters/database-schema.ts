import { sql } from 'drizzle-orm';
import * as PG from 'drizzle-orm/pg-core';
import { base } from '#lib/server/db/columns.ts';
import { EMBEDDING_DIMENSIONS } from '#lib/server/shared/onnx/models.ts';
import { users } from '#services/auth/adapters/database-schema.ts';
import { AccountType, DisposalKind, LotOrigin, PriceKind, PriceSource } from '../domain/types';

export const accountType = PG.pgEnum('account_type', AccountType);
export const priceKind = PG.pgEnum('price_kind', PriceKind);
export const priceSource = PG.pgEnum('price_source', PriceSource);
export const lotOrigin = PG.pgEnum('lot_origin', LotOrigin);
export const disposalKind = PG.pgEnum('disposal_kind', DisposalKind);

// The handle also names the ledger's folder in its owner's storage, so it never changes.
export const ledgers = PG.pgTable(
	'ledgers',
	(t) => ({
		...base,
		ownerId: t
			.uuid()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		handle: t.text().notNull().unique('ledgers_handle_unique'),
		name: t.text().notNull(),
	}),
	(t) => [PG.index('ledgers_owner_id').on(t.ownerId)],
);

export const memberships = PG.pgTable(
	'memberships',
	(t) => ({
		...base,
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
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		fileId: t
			.uuid()
			.notNull()
			.references(() => ledgerFiles.id, { onDelete: 'cascade' }),
		line: t.integer().notNull(),
		date: t.date().notNull(),
		time: t.time(),
		description: t.text().notNull(),
		embedding: t.vector({ dimensions: EMBEDDING_DIMENSIONS }), // of the description; filled lazily
		embeddingModel: t.text(),
	}),
	(t) => [
		PG.index('transactions_file_id').on(t.fileId),
		PG.index('transactions_ledger_id_date').on(t.ledgerId, t.date),
		PG.index('transactions_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
	],
);

export const postings = PG.pgTable(
	'postings',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		transactionId: t
			.uuid()
			.notNull()
			.references(() => transactions.id, { onDelete: 'cascade' }),
		position: t.integer().notNull(),
		account: t.text().notNull(),
		accountType: accountType().notNull(),
		amount: t.bigint({ mode: 'bigint' }).notNull(), // signed millionths
		commodity: t.text().notNull(),
		priceAmount: t.bigint({ mode: 'bigint' }), // price fields: all or none
		priceCommodity: t.text(),
		priceKind: priceKind(),
		costAmount: t.bigint({ mode: 'bigint' }), // lot cost of one unit; with its commodity, all or none
		costCommodity: t.text(),
		costDate: t.date(),
		balance: t.bigint({ mode: 'bigint' }),
	}),
	(t) => [
		PG.index('postings_transaction_id').on(t.transactionId),
		PG.index('postings_ledger_id_account_amount').on(t.ledgerId, t.account, t.commodity, t.amount), // refinement matches
		PG.index('postings_ledger_id_commodity').on(t.ledgerId, t.commodity), // lots are booked per commodity
		PG.index('postings_ledger_id_balance')
			.on(t.ledgerId, t.account, t.commodity)
			.where(sql`${t.balance} IS NOT NULL`),
	],
);

export const prices = PG.pgTable(
	'prices',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		fileId: t
			.uuid()
			.notNull()
			.references(() => ledgerFiles.id, { onDelete: 'cascade' }),
		line: t.integer().notNull(),
		date: t.date().notNull(),
		commodity: t.text().notNull(),
		priceAmount: t.bigint({ mode: 'bigint' }).notNull(), // of one unit, in millionths
		priceCommodity: t.text().notNull(),
		source: priceSource().notNull(),
	}),
	(t) => [
		PG.index('prices_file_id').on(t.fileId),
		PG.index('prices_ledger_id_commodity_date').on(t.ledgerId, t.commodity, t.date),
	],
);

export const lots = PG.pgTable(
	'lots',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		postingId: t
			.uuid()
			.notNull()
			.references(() => postings.id, { onDelete: 'cascade' }),
		sourceId: t.uuid().references((): PG.AnyPgColumn => lots.id, { onDelete: 'set null' }), // the lot a transfer moved
		account: t.text().notNull(),
		commodity: t.text().notNull(),
		origin: lotOrigin().notNull(),
		date: t.date().notNull(),
		units: t.bigint({ mode: 'bigint' }).notNull(), // signed millionths; negative for a short
		remaining: t.bigint({ mode: 'bigint' }).notNull(),
		costAmount: t.bigint({ mode: 'bigint' }).notNull(), // of one unit
		costCommodity: t.text().notNull(),
	}),
	(t) => [
		PG.index('lots_ledger_id_commodity_account').on(t.ledgerId, t.commodity, t.account),
		PG.index('lots_posting_id').on(t.postingId),
		PG.index('lots_source_id').on(t.sourceId),
	],
);

export const disposals = PG.pgTable(
	'disposals',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		lotId: t.uuid().references(() => lots.id, { onDelete: 'cascade' }), // none when no open lot covers it
		postingId: t
			.uuid()
			.notNull()
			.references(() => postings.id, { onDelete: 'cascade' }),
		commodity: t.text().notNull(),
		kind: disposalKind().notNull(),
		units: t.bigint({ mode: 'bigint' }).notNull(), // what the lot changes by, signed millionths
		priceAmount: t.bigint({ mode: 'bigint' }), // of one unit; with its commodity, all or none
		priceCommodity: t.text(),
	}),
	(t) => [
		PG.index('disposals_lot_id').on(t.lotId),
		PG.index('disposals_posting_id').on(t.postingId),
		PG.index('disposals_ledger_id_commodity').on(t.ledgerId, t.commodity),
		PG.index('disposals_ledger_id_unmatched')
			.on(t.ledgerId)
			.where(sql`${t.lotId} IS NULL`),
	],
);

export const metadata = PG.pgTable(
	'metadata',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
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
		PG.index('metadata_ledger_id_key_value').on(t.ledgerId, t.key, t.value),
		PG.check(
			'metadata_one_owner',
			sql`num_nonnulls(${t.fileId}, ${t.transactionId}, ${t.postingId}) = 1`,
		),
	],
);
