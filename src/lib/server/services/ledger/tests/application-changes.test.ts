import { provide } from '#lib/server/shared/context/context.ts';
import { listJobs } from '#services/jobs/application/jobs.ts';
import { syncLedger } from '#services/ledger/adapters/jobs.ts';
import { followChanges } from '#services/ledger/application/changes.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect, vi } from 'vitest';
import { groceries, put } from './fixtures/files';

const queued = async (l: Ledger) =>
	(
		await listJobs({ userId: l.owner, name: syncLedger.name, payload: {}, limit: 10 })
	)._unsafeUnwrap();

describe('following changes', () => {
	it('queues a sync of the ledger whose files changed, and nothing for other keys', ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const controller = new AbortController();
			const following = followChanges(controller.signal);

			// The watch starts listening a moment after it is first asked for a key.
			await new Promise((r) => setTimeout(r, 100));
			await storage.write({
				key: `users/${ledger.owner}/schemas/bank.yaml`,
				content: new TextEncoder().encode(''),
			});
			await put(storage, ledger, 'a.rupea', groceries);

			await vi.waitFor(async () => expect(await queued(ledger)).toHaveLength(1));
			controller.abort();
			await following;

			expect((await queued(ledger))[0]?.payload).toEqual({ ledger: ledger.handle });
		}));
});
