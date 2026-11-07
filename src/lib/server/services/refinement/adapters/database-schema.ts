import * as PG from 'drizzle-orm/pg-core';
import { base } from '#lib/server/db/columns.ts';
import { ledgerColumn } from '#services/ledger/adapters/database-schema.ts';

export const dismissedMatches = PG.pgTable(
	'dismissed_matches',
	(t) => ({
		...base,
		ledgerId: ledgerColumn(),
		fingerprint: t.text().notNull(), // declined suggestion pair
	}),
	(t) => [PG.unique('dismissed_matches_ledger_id_fingerprint').on(t.ledgerId, t.fingerprint)],
);
