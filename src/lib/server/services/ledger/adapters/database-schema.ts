import { base } from '#lib/server/db/columns.ts';
import { EMBEDDING_DIMENSIONS } from '#lib/server/shared/onnx/models.ts';
import { users } from '#services/auth/adapters/database-schema.ts';
import { sql } from 'drizzle-orm';
import * as PG from 'drizzle-orm/pg-core';
import { AccountType, DisposalKind, LotOrigin, PriceKind, PriceSource } from '../domain/types';

export const accountType = PG.pgEnum('account_type', AccountType);
export const priceKind = PG.pgEnum('price_kind', PriceKind);
export const priceSource = PG.pgEnum('price_source', PriceSource);
export const lotOrigin = PG.pgEnum('lot_origin', LotOrigin);
export const disposalKind = PG.pgEnum('disposal_kind', DisposalKind);

// Ten-billionths of a unit; a bigint would overflow past 900 million units or on a product.
const amount = () => PG.numeric({ precision: 38, scale: 0, mode: 'bigint' });

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
		counted: t.boolean().notNull().default(true), // false for an event's evidence; set once files settle
	}),
	(t) => [
		PG.index('transactions_file_id').on(t.fileId),
		PG.index('transactions_ledger_id_order').on(
			t.ledgerId,
			t.date,
			sql`coalesce(${t.time}, '00:00')`,
			t.id,
		), // lists page by it
		PG.index('transactions_ledger_id_uncounted')
			.on(t.ledgerId)
			.where(sql`not ${t.counted}`),
		PG.index('transactions_description').using('gin', sql`${t.description} gin_trgm_ops`),
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

		// What moves into the account, or out when negative, in signed ten-billionths.
		amount: amount().notNull(),
		commodity: t.text().notNull(),

		// What the commodity is worth in another: `@` per unit or `@@` in total. All or none.
		priceAmount: amount(),
		priceCommodity: t.text(),
		priceKind: priceKind(),

		// The `{cost, date}` per unit of the lot this takes from; balances in place of the price.
		costAmount: amount(),
		costCommodity: t.text(),
		costDate: t.date(),

		// What the account holds of this commodity after this posting, when the file asserts it.
		balance: amount(),
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
		priceAmount: amount().notNull(), // of one unit, in ten-billionths
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
		units: amount().notNull(), // signed ten-billionths; negative for a short
		remaining: amount().notNull(),
		costAmount: amount().notNull(), // of one unit
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
		units: amount().notNull(), // what the lot changes by, signed ten-billionths
		priceAmount: amount(), // of one unit; with its commodity, all or none
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
