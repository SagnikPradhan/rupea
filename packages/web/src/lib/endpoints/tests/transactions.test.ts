import { listPostings, listTransactions } from '#lib/endpoints/transactions.remote.ts';
import { useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const day = '2026-09-01';
const filter = { period: { kind: 'all' }, account: '', description: '' } as const;
const month = { kind: 'month', at: '2026-08' } as const;
const page = { rows: [], next: null };

describe('transactions', () => {
	it('list the span of the period, leaving out an account or description left empty', async () => {
		const listed = vi.fn().mockResolvedValue(page);
		useApi({ listTransactions: listed });

		await listTransactions({
			handle: 'home',
			day,
			filter: { ...filter, period: month },
			after: null,
		});
		const narrowed = { ...filter, period: month, account: 'Expenses', description: 'rent' };
		await listTransactions({ handle: 'home', day, filter: narrowed, after: null });

		const span = { handle: 'home', from: '2026-08-01', to: '2026-08-31' };
		expect(listed).toHaveBeenNthCalledWith(1, { ...span, after: undefined });
		expect(listed).toHaveBeenNthCalledWith(2, {
			...span,
			account: 'Expenses',
			description: 'rent',
			after: undefined,
		});
	});

	it('continue after the cursor of the page before', async () => {
		const listed = vi.fn().mockResolvedValue(page);
		useApi({ listTransactions: listed, listPostings: listed });
		const cursor = {
			date: '2026-08-29',
			time: '09:30:00',
			id: '0196f4a2-7c1e-7000-8000-000000000001',
		};

		await listTransactions({ handle: 'home', day, filter, after: cursor });
		await listPostings({ handle: 'home', day, filter, after: { ...cursor, position: 2 } });

		expect(listed.mock.calls.map(([input]) => input.after)).toEqual([
			cursor,
			{ ...cursor, position: 2 },
		]);
	});

	it('are shown as text, with the time to the minute', async () => {
		const row = {
			id: 't1',
			counted: true,
			file: 'a.rupea',
			line: 1,
			date: '2026-08-29',
			time: '18:45:30',
			description: 'Groceries',
			comment: null,
			postings: [
				{
					account: 'Expenses:Food',
					quantity: { amount: '100.00', commodity: 'INR', price: null, cost: null },
				},
			],
		};
		useApi({ listTransactions: () => Promise.resolve({ rows: [row], next: null }) });

		const listed = await listTransactions({ handle: 'home', day, filter, after: null });

		expect(listed.data?.rows[0]).toMatchObject({
			time: '18:45',
			postings: [{ account: 'Expenses:Food', quantity: '100.00' }],
		});
	});

	it('list postings keyed by transaction and position', async () => {
		const posting = {
			transaction: 't1',
			position: 1,
			file: 'a.rupea',
			line: 1,
			date: '2026-08-29',
			description: 'Groceries',
			account: 'Expenses:Food',
			quantity: { amount: '100.00', commodity: 'INR', price: null, cost: null },
		};
		useApi({ listPostings: () => Promise.resolve({ rows: [posting], next: null }) });

		const listed = await listPostings({ handle: 'home', day, filter, after: null });

		expect(listed.data?.rows[0]).toMatchObject({ key: 't1:1', quantity: '100.00' });
	});

	it('answer a failure of the server as the reply', async () => {
		useApi({ listTransactions: () => Promise.reject(new Error('down')) });

		const listed = await listTransactions({ handle: 'home', day, filter, after: null });

		expect(listed).toMatchObject({ ok: false, data: null, errors: [{ type: 'UnknownError' }] });
	});
});
