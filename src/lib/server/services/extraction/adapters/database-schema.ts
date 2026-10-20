import * as PG from 'drizzle-orm/pg-core';
import { base } from '#lib/server/db/columns.ts';
import { ledgers } from '#services/ledger/adapters/database-schema.ts';

// What the statements folder holds, so a statement is found by its content without hashing the folder.
export const statements = PG.pgTable(
	'statements',
	(t) => ({
		...base,
		ledgerId: t
			.uuid()
			.notNull()
			.references(() => ledgers.id, { onDelete: 'cascade' }),
		path: t.text().notNull(),
		checksum: t.text().notNull(),
		original: t.text(),
	}),
	(t) => [
		PG.unique('statements_ledger_id_path').on(t.ledgerId, t.path),
		PG.index('statements_ledger_id_checksum').on(t.ledgerId, t.checksum),
		PG.index('statements_ledger_id_original').on(t.ledgerId, t.original),
	],
);

// Contents already read, so previewing a statement again skips the slow PDF table detection.
export const statementGrids = PG.pgTable(
	'statement_grids',
	(t) => ({
		...base,
		checksum: t.text().notNull(),
		reader: t.text().notNull(),
		grid: t.jsonb().$type<string[][]>().notNull(),
		text: t.jsonb().$type<string[]>().notNull().default([]),
		expiresAt: t.timestamp({ withTimezone: true }).notNull(),
	}),
	(t) => [
		PG.unique('statement_grids_checksum_reader').on(t.checksum, t.reader),
		PG.index('statement_grids_expires_at').on(t.expiresAt),
	],
);
