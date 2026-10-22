import { eq } from 'drizzle-orm';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { dismissedMatches as table } from './database-schema';

// A ledger has only the few dismissals its user made, so they load whole.
export const listDismissals = (ledgerId: string): ResultAsync<Set<string>> =>
	withContext('db')((db) =>
		attempt(() =>
			db.select({ fingerprint: table.fingerprint }).from(table).where(eq(table.ledgerId, ledgerId)),
		).map((l) => new Set(l.map((r) => r.fingerprint))),
	);

export const saveDismissal = (ledgerId: string, fingerprint: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.insert(table)
				.values({ ledgerId, fingerprint })
				.onConflictDoNothing()
				.then(() => undefined),
		),
	);
