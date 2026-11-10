import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createApi } from '../api/api.ts';

const content = [
	'2026-10-01 Salary',
	'\tAssets:Bank 100000',
	'\tIncome:Salary',
	'',
	'2026-10-02 10:30 Dinner',
	'\tExpenses:Food 2000.5',
	'\tAssets:Bank',
	'',
	'2026-10-03 Buy',
	'\tAssets:Zerodha 2 INFY @ 1500',
	'\tAssets:Bank',
	'',
].join('\n');

const plain = (amount: string) => ({ amount, commodity: 'INR', price: null, cost: null });

const seeded = async (context: Parameters<typeof createApi>[0]) => {
	const ledger = await createLedger(context.db);
	await Files.createFile({ ledger, key: 'a.rupea', content });
	const api = await createApi(context);
	const headers = await bearerOf(ledger.owner);

	return { url: `/api/ledgers/${ledger.handle}`, api, headers };
};

describe('the transactions api', () => {
	it('lists transactions newest first with their postings as structured quantities', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				url: `${url}/transactions?from=2026-10-01&to=2026-10-02`,
				headers,
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				rows: [
					{
						id: expect.any(String),
						counted: true,
						file: 'a.rupea',
						line: 5,
						date: '2026-10-02',
						time: '10:30:00',
						description: 'Dinner',
						comment: null,
						postings: [
							{ account: 'Expenses:Food', quantity: plain('2000.50') },
							{ account: 'Assets:Bank', quantity: plain('-2000.50') },
						],
					},
					expect.objectContaining({ date: '2026-10-01', time: null, description: 'Salary' }),
				],
				next: null,
			});
		}));

	it('narrows transactions by account and description', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				url: `${url}/transactions?from=2026-10-01&to=2026-10-03&account=Assets:Zerodha&description=buy`,
				headers,
			});

			expect(reply.json().rows.map((r: { description: string }) => r.description)).toEqual(['Buy']);
		}));

	it('lists postings with the position that keeps a page cursor', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				url: `${url}/postings?from=2026-10-03&to=2026-10-03`,
				headers,
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				rows: [
					{
						transaction: expect.any(String),
						position: 0,
						file: 'a.rupea',
						line: 9,
						date: '2026-10-03',
						description: 'Buy',
						account: 'Assets:Zerodha',
						quantity: {
							amount: '2.00',
							commodity: 'INFY',
							price: { amount: '1500.00', commodity: 'INR', kind: 'unit' },
							cost: null,
						},
					},
					expect.objectContaining({
						position: 1,
						account: 'Assets:Bank',
						quantity: plain('-3000.00'),
					}),
				],
				next: null,
			});
		}));

	it('continues a page of postings after a cursor, whose position a query carries as text', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const span = 'from=2026-10-03&to=2026-10-03';
			const first = await api.inject({ url: `${url}/postings?${span}`, headers });
			const id = first.json().rows[0].transaction;
			const after = `after[date]=2026-10-03&after[time]=00:00:00&after[id]=${id}&after[position]=0`;

			const reply = await api.inject({ url: `${url}/postings?${span}&${after}`, headers });

			expect(reply.statusCode).toBe(200);
			expect(reply.json().rows.map((r: { position: number }) => r.position)).toEqual([1]);
		}));

	it('pages transactions by the cursor it answers', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const many = Array.from(
				{ length: 101 },
				(_, i) =>
					`2026-10-01 10:${String(i % 60).padStart(2, '0')} Coffee ${i}\n\tExpenses:Food 10\n\tAssets:Bank\n`,
			).join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: many });
			const api = await createApi(context);
			const headers = await bearerOf(ledger.owner);
			const url = `/api/ledgers/${ledger.handle}/transactions?from=2026-10-01&to=2026-10-01`;

			const first = await api.inject({ url, headers });
			const { date, time, id } = first.json().next;
			const second = await api.inject({
				url: `${url}&after[date]=${date}&after[time]=${time}&after[id]=${id}`,
				headers,
			});

			expect(first.json().rows).toHaveLength(100);
			expect(second.json().rows).toHaveLength(1);
			expect(second.json().next).toBeNull();
		}));
});
