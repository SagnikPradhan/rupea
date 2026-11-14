import { ORPCError } from '@orpc/client';
import {
	findBridge,
	listAccounts,
	listDailyDeltas,
	listDeltas,
	listDrops,
	listHoldings,
	listInvested,
	listLots,
	listReturns,
	listTerms,
	listWorth,
	saveTerms,
} from '#lib/endpoints/accounts.remote.ts';
import { fault } from '@rupea/shared/errors.ts';
import { useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const day = '2026-09-01';
const month = { kind: 'month', at: '2026-09' } as const;
const empty = { succeeded: [], failed: [] };

describe('accounts', () => {
	it('lists what accounts held at the end of the period, printing holdings for the page', async () => {
		const listed = vi.fn().mockResolvedValue({
			succeeded: [
				{
					from: '2026-09-01',
					to: '2026-09-01',
					base: 'INR',
					rows: [
						{
							account: 'Assets:Broker',
							commodity: 'INFY',
							bucket: '2026-09-01',
							unpriced: 0,
							units: '2.00',
							price: { amount: '1500.00', commodity: 'INR' },
							value: '3000.00',
							cost: '3000.00',
						},
					],
				},
			],
			failed: [],
		});
		useApi({ accounts: { listBalances: listed, list: vi.fn().mockResolvedValue([]) } });

		const accounts = await listHoldings({ handle: 'home', day, period: month });

		expect(listed).toHaveBeenCalledWith({
			handle: 'home',
			from: '2026-09-01',
			to: '2026-09-01',
			bucket: 'date',
			accumulate: 'historical',
			measures: ['value', 'units', 'price', 'cost'],
		});
		expect(accounts.ok).toBe(true);
		expect(accounts.data?.[0]?.holdings[0]).toMatchObject({ units: '2.00 INFY', price: '1500.00' });
	});

	it('lists worth over the period, narrowed to an account only when one is given', async () => {
		const listed = vi.fn().mockResolvedValue(empty);
		useApi({ accounts: { listBalances: listed, list: vi.fn().mockResolvedValue([]) } });

		await listWorth({ handle: 'home', day, period: month, account: null });
		await listWorth({ handle: 'home', day, period: month, account: 'Assets:Bank' });

		const span = {
			handle: 'home',
			from: '2026-09-01',
			to: '2026-09-01',
			bucket: 'date',
			accumulate: 'historical',
			measures: ['value', 'units'],
		};
		expect(listed).toHaveBeenNthCalledWith(1, { ...span, account: undefined });
		expect(listed).toHaveBeenNthCalledWith(2, { ...span, account: 'Assets:Bank' });
	});

	it('divides worth into the accounts the tree divides into, owing liabilities', async () => {
		const row = (account: string, value: string, unpriced = 0) => ({
			account,
			commodity: null,
			bucket: '2026-09-01',
			unpriced,
			value,
			units: value,
		});
		const listed = vi.fn().mockResolvedValue({
			succeeded: [
				{
					from: '2026-09-01',
					to: '2026-09-01',
					base: 'INR',
					rows: [
						row('Assets', '1500.00'),
						row('Assets:Bank', '1000.00'),
						row('Assets:Cash', '500.00'),
						row('Liabilities', '-200.00'),
						row('Liabilities:Card', '-200.00'),
					],
				},
			],
			failed: [],
		});
		const tree = [
			{ account: 'Assets', parent: null, posted: false },
			{ account: 'Assets:Bank', parent: 'Assets', posted: true },
			{ account: 'Assets:Cash', parent: 'Assets', posted: true },
			{ account: 'Liabilities', parent: null, posted: false },
			{ account: 'Liabilities:Card', parent: 'Liabilities', posted: true },
		];
		useApi({ accounts: { listBalances: listed, list: vi.fn().mockResolvedValue(tree) } });

		const worth = await listWorth({ handle: 'home', day, period: month, account: null });

		expect(worth.data).toEqual([
			{
				day: '2026-09-01',
				assets: '1500.00',
				liabilities: '-200.00',
				worth: '1300.00',
				parts: [
					{ account: 'Assets:Bank', commodity: null, amount: '1000.00' },
					{ account: 'Assets:Cash', commodity: null, amount: '500.00' },
					{ account: 'Liabilities:Card', commodity: null, amount: '-200.00' },
				],
				unpriced: 0,
			},
		]);
	});

	it('lists spending against the period before it, when there is one', async () => {
		const listed = vi.fn().mockResolvedValue({ succeeded: [], failed: [] });
		useApi({ accounts: { listBalances: listed, list: vi.fn().mockResolvedValue([]) } });

		await listDeltas({ handle: 'home', day, period: month, account: 'Expenses' });
		await listDeltas({ handle: 'home', day, period: { kind: 'all' }, account: 'Expenses' });

		const asked = listed.mock.calls.map(([input]) => [input.from, input.to, input.bucket]);
		expect(asked).toEqual([
			['2026-09-01', '2026-09-01', 'date'],
			['2026-08-01', '2026-08-01', 'date'],
			['0001-01-01', '2026-09-01', 'year'],
		]);
	});

	it('keeps the failures of the period and of the one before it', async () => {
		const bad = (location: string) => fault('ParseInvalidPosting', { location });
		const listed = vi
			.fn()
			.mockResolvedValueOnce({ succeeded: [], failed: [bad('a:1')] })
			.mockResolvedValueOnce({ succeeded: [], failed: [bad('b:2')] });
		useApi({ accounts: { listBalances: listed, list: vi.fn().mockResolvedValue([]) } });

		const spending = await listDeltas({ handle: 'home', day, period: month, account: 'Expenses' });

		expect(spending.errors).toEqual([bad('a:1'), bad('b:2')]);
	});

	it('asks the other reads over the days of the period, written out', async () => {
		const listed = vi.fn().mockResolvedValue(empty);
		useApi({
			accounts: {
				findBridge: listed,
				listDrops: listed,
				listReturns: listed,
				listBalances: listed,
			},
		});
		const asked = { handle: 'home', day, period: month };

		await findBridge(asked);
		await listDrops({ ...asked, account: null });
		await listReturns(asked);
		await listDailyDeltas({ ...asked, account: 'Expenses' });

		const span = { handle: 'home', from: '2026-09-01', to: '2026-09-01' };
		expect(listed.mock.calls.map(([input]) => input)).toEqual([
			span,
			{ ...span, account: null },
			span,
			{ ...span, account: 'Expenses', bucket: 'day', aggregate: 'average' },
		]);
	});

	it('reads invested from balances held at the end of each day, valued and as paid', async () => {
		const listed = vi.fn().mockResolvedValue({
			succeeded: [
				{
					from: '2026-09-01',
					to: '2026-09-02',
					base: 'INR',
					rows: [
						{
							account: 'Assets',
							commodity: 'INFY',
							bucket: '2026-09-01',
							unpriced: 0,
							value: '300.00',
							paid: '250.00',
						},
						{
							account: 'Assets',
							commodity: 'INR',
							bucket: '2026-09-01',
							unpriced: 0,
							value: '900.00',
							paid: '0.00',
						},
						{
							account: 'Assets',
							commodity: 'INFY',
							bucket: '2026-09-02',
							unpriced: 0,
							value: '320.00',
							paid: '250.00',
						},
						{
							account: 'Assets:Broker',
							commodity: 'INFY',
							bucket: '2026-09-02',
							unpriced: 0,
							value: '320.00',
							paid: '250.00',
						},
					],
				},
			],
			failed: [],
		});
		useApi({ accounts: { listBalances: listed } });

		const invested = await listInvested({ handle: 'home', day, period: month, account: null });

		expect(listed).toHaveBeenCalledWith({
			handle: 'home',
			from: '2026-09-01',
			to: '2026-09-01',
			account: 'Assets',
			bucket: 'date',
			accumulate: 'historical',
			measures: ['value', 'paid', 'units'],
		});
		expect(invested.data).toEqual([
			{ day: '2026-09-01', value: '300.00', cost: '250.00' },
			{ day: '2026-09-02', value: '320.00', cost: '250.00' },
		]);
	});

	it('asks for the accounts and the terms of a day', async () => {
		const accounts = vi.fn().mockResolvedValue([]);
		const terms = vi.fn().mockResolvedValue({});
		useApi({ accounts: { list: accounts, listTerms: terms } });

		await listAccounts('home');
		await listTerms({ handle: 'home', day });

		expect(accounts).toHaveBeenCalledWith({ handle: 'home' });
		expect(terms).toHaveBeenCalledWith({ handle: 'home', day: '2026-09-01' });
	});

	it('keeps what succeeded beside the failures of a batch', async () => {
		const failed = { type: 'ReturnUnsolved', account: 'Assets:Broker' } as const;
		useApi({ accounts: { listLots: () => Promise.resolve({ succeeded: [], failed: [failed] }) } });

		const lots = await listLots({ handle: 'home', account: 'Assets:Broker', commodity: 'INFY' });

		expect(lots).toEqual({ ok: false, data: [], errors: [failed] });
	});

	it('answers a ledger that is not found as the failure it was refused with', async () => {
		const missing = { type: 'LedgerNotFound', handle: 'gone' } as const;
		const refused = new ORPCError('MISSING', { status: 404, defined: true, data: missing });
		useApi({
			accounts: {
				listBalances: () => Promise.reject(refused),
				list: () => Promise.reject(refused),
			},
		});

		const accounts = await listHoldings({ handle: 'gone', day, period: month });

		expect(accounts).toEqual({ ok: false, data: null, errors: [missing] });
	});

	it('saves terms under the ledger, sending the account and its lines', async () => {
		const saved = vi.fn().mockResolvedValue({ file: 'a.rupea' });
		useApi({ accounts: { saveTerms: saved } });
		const form = {
			account: 'Liabilities:Card',
			entries: [
				['kind', 'card'],
				['limit', '50000'],
			] as [string, string][],
		};

		const reply = await saveTerms({ handle: 'home', form });

		expect(saved).toHaveBeenCalledWith({ handle: 'home', ...form });
		expect(reply).toEqual({ ok: true, data: { file: 'a.rupea' }, errors: [] });
	});
});
