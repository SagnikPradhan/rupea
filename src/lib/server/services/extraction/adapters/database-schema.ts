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
		key: t.text().notNull(),
		checksum: t.text().notNull(),
		originalChecksum: t.text(),
	}),
	(t) => [
		PG.unique('statements_ledger_id_key').on(t.ledgerId, t.key),
		PG.index('statements_ledger_id_checksum').on(t.ledgerId, t.checksum),
		PG.index('statements_ledger_id_original_checksum').on(t.ledgerId, t.originalChecksum),
	],
);

// Contents already read, so previewing a statement again skips the slow PDF table detection.
export const statementContents = PG.pgTable(
	'statement_contents',
	(t) => ({
		...base,
		checksum: t.text().notNull(),
		reader: t.text().notNull(),
		grid: t.jsonb().$type<string[][]>().notNull(),
		text: t.jsonb().$type<string[]>().notNull().default([]),
		expiresAt: t.timestamp({ withTimezone: true }).notNull(),
	}),
	(t) => [
		PG.unique('statement_contents_checksum_reader').on(t.checksum, t.reader),
		PG.index('statement_contents_expires_at').on(t.expiresAt),
	],
);
