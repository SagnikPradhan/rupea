import type { Kyselify } from 'drizzle-orm/kysely';
import type {
	deltas,
	disposals,
	ledgerFiles,
	ledgers,
	lots,
	memberships,
	metadata,
	postings,
	prices,
	symbols,
	transactions,
} from '#services/ledger/adapters/database-schema.ts';

/** The tables Kysely queries, named and typed as the database has them. */
export type Tables = {
	deltas: Kyselify<typeof deltas>;
	disposals: Kyselify<typeof disposals>;
	ledgerFiles: Kyselify<typeof ledgerFiles>;
	ledgers: Kyselify<typeof ledgers>;
	lots: Kyselify<typeof lots>;
	memberships: Kyselify<typeof memberships>;
	metadata: Kyselify<typeof metadata>;
	postings: Kyselify<typeof postings>;
	prices: Kyselify<typeof prices>;
	symbols: Kyselify<typeof symbols>;
	transactions: Kyselify<typeof transactions>;
};
