import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { sql } from 'kysely';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createApi } from '../api/api.ts';

describe('the ledger api', () => {
	it('lists the ledgers of the caller and whether they own each', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await createLedger(db);
			const api = await createApi(context);

			const reply = await api.inject({
				url: '/api/ledgers',
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual([{ handle: ledger.handle, name: 'Test', owned: true }]);
		}));

	it('answers the day of the first transaction, or null before one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const headers = await bearerOf(ledger.owner);
			const api = await createApi(context);
			const url = `/api/ledgers/${ledger.handle}/first-day`;

			const before = await api.inject({ url, headers });
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2026-10-02 Salary\n\tAssets:Bank 500\n\tIncome:Salary\n',
			});
			const after = await api.inject({ url, headers });

			expect(before.json()).toBeNull();
			expect(after.json()).toBe('2026-10-02');
		}));

	it('lists what is wrong across the ledger with the failures beside no successes', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'b.rupea',
				content: '2026-10-02 Broken\n\tAssets:Bank 5\n',
			});
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/problems`,
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.json()).toEqual({
				succeeded: [],
				failed: [{ type: 'ParseMissingTransactionBody', location: 'b.rupea:1' }],
			});
		}));

	it('queues a resync, which the sync then reports', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const headers = await bearerOf(ledger.owner);
			const api = await createApi(context);
			const url = `/api/ledgers/${ledger.handle}/sync`;

			const before = await api.inject({ url, headers });
			const queued = await api.inject({ method: 'POST', url, headers });
			const after = await api.inject({ url, headers });

			expect(before.json()).toBeNull();
			expect(queued.statusCode).toBe(200);
			expect(after.json()).toBe('queued');
		}));

	it('queues one resync for two calls in a row', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const headers = await bearerOf(ledger.owner);
			const api = await createApi(context);
			const url = `/api/ledgers/${ledger.handle}/sync`;

			const first = await api.inject({ method: 'POST', url, headers });
			const second = await api.inject({ method: 'POST', url, headers });
			const queued = await db
				.selectFrom('jobs')
				.select('id')
				.where('name', '=', 'sync-ledger')
				.where(sql<boolean>`payload ->> 'ledger' = ${ledger.handle}`)
				.execute();

			expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
			expect(queued).toHaveLength(1);
		}));
});
