import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';

// A ledger has only the few dismissals its user made, so they load whole.
export const listDismissals = (ledgerId: string): ResultAsync<Set<string>> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('dismissedMatches')
				.select('fingerprint')
				.where('ledgerId', '=', ledgerId)
				.execute(),
		).map((l) => new Set(l.map((r) => r.fingerprint))),
	);

export const saveDismissal = (ledgerId: string, fingerprint: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insertInto('dismissedMatches')
				.values({ ledgerId, fingerprint })
				.onConflict((c) => c.doNothing())
				.execute();
		}),
	);
