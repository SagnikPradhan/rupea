import type { Kyselify } from 'drizzle-orm/kysely';
import type { AccountType } from '#services/ledger/domain/types.ts';
import type { emailCodes, sessions, users } from '#services/auth/adapters/database-schema.ts';
import type {
	statementContents,
	statements,
} from '#services/extraction/adapters/database-schema.ts';
import type { jobs } from '#services/jobs/adapters/database-schema.ts';
import type {
	accounts,
	disposals,
	ledgerFiles,
	ledgers,
	lots,
	memberships,
	metadata,
	monthlyDeltas,
	postings,
	prices,
	symbolFetches,
	symbolLinks,
	symbols,
	transactions,
} from '#services/ledger/adapters/database-schema.ts';
import type { dismissedMatches } from '#services/refinement/adapters/database-schema.ts';
import type { storages } from '#services/storage/adapters/database-schema.ts';

/** The tables Kysely queries, named and typed as the database has them. */
export type Tables = {
	accounts: Kyselify<typeof accounts>;
	/** A view: what an account's counted postings of a commodity moved on one day. */
	dailyDeltas: {
		ledgerId: string;
		accountId: string;
		accountType: AccountType;
		commodity: string;
		date: string;
		amount: bigint;
	};
	dismissedMatches: Kyselify<typeof dismissedMatches>;
	disposals: Kyselify<typeof disposals>;
	emailCodes: Kyselify<typeof emailCodes>;
	jobs: Kyselify<typeof jobs>;
	ledgerFiles: Kyselify<typeof ledgerFiles>;
	ledgers: Kyselify<typeof ledgers>;
	lots: Kyselify<typeof lots>;
	memberships: Kyselify<typeof memberships>;
	metadata: Kyselify<typeof metadata>;
	monthlyDeltas: Kyselify<typeof monthlyDeltas>;
	postings: Kyselify<typeof postings>;
	prices: Kyselify<typeof prices>;
	sessions: Kyselify<typeof sessions>;
	statementContents: Kyselify<typeof statementContents>;
	statements: Kyselify<typeof statements>;
	storages: Kyselify<typeof storages>;
	symbolFetches: Kyselify<typeof symbolFetches>;
	symbolLinks: Kyselify<typeof symbolLinks>;
	symbols: Kyselify<typeof symbols>;
	transactions: Kyselify<typeof transactions>;
	users: Kyselify<typeof users>;
};
