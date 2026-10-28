import { provide } from '#lib/server/shared/context/context.ts';
import { listJobs } from '#services/jobs/application/jobs.ts';
import { syncLedger } from '#services/ledger/adapters/jobs.ts';
import { syncChanged } from '#services/ledger/adapters/subscriptions.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';

const queued = async (l: Ledger) =>
	(
		await listJobs({ userId: l.owner, name: syncLedger.name, payload: {}, limit: 10 })
	)._unsafeUnwrap();

describe('syncing changed files', () => {
	it.for(['files/a.rupea', 'files/bank/a.rupea', 'files', ''])(
		'queues a sync for a change to %j',
		(path, { context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const key = [`ledgers/${ledger.handle}`, path].filter((k) => k !== '').join('/');
				await syncChanged.run({ keys: [key] }, ledger.owner);

				expect((await queued(ledger)).map((j) => j.payload)).toEqual([{ ledger: ledger.handle }]);
			}),
	);

	it('queues one sync for many changes to one ledger', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const files = `ledgers/${ledger.handle}/files`;
			await syncChanged.run({ keys: [`${files}/a.rupea`, `${files}/b.rupea`] }, ledger.owner);

			expect(await queued(ledger)).toHaveLength(1);
		}));

	it("queues nothing for keys outside a ledger's files", ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const keys = ['schemas/bank.yaml', 'ledgers', `ledgers/${ledger.handle}/schemas/a.yaml`];
			await syncChanged.run({ keys }, ledger.owner);

			expect(await queued(ledger)).toEqual([]);
		}));
});
