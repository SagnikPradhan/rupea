import { ORPCError } from '@orpc/client';
import {
	findBridge,
	listAccountNames,
	listAccountTree,
	listAccounts,
	listDailyDeltas,
	listDeltas,
	listDrops,
	listInvested,
	listLots,
	listReturns,
	listTerms,
	listWorth,
	saveTerms,
} from '#lib/endpoints/accounts.remote.ts';
import { useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const day = '2026-09-01';
const month = { kind: 'month', at: '2026-09' } as const;
const empty = { succeeded: [], failed: [] };

describe('accounts', () => {
	it('lists balances at the end of the period, printing holdings for the page', async () => {
		const listed = vi.fn().mockResolvedValue({
			succeeded: [
				{
					account: 'Assets:Broker',
					parent: 'Assets',
					holdings: [
						{
							commodity: 'INFY',
							hasLots: true,
							units: '2.00',
							price: { amount: '1500.00', commodity: 'INR' },
							value: '3000.00',
							paid: '3000.00',
							gain: '0.00',
						},
					],
					total: '3000.00',
					cost: '3000.00',
					gain: '0.00',
					unpriced: 0,
				},
			],
			failed: [],
		});
		useApi({ accounts: { list: listed } });

		const accounts = await listAccounts({ handle: 'home', day, period: month });

		expect(listed).toHaveBeenCalledWith({ handle: 'home', day: '2026-09-01' });
		expect(accounts.ok).toBe(true);
		expect(accounts.data?.[0]?.holdings[0]).toMatchObject({ units: '2.00 INFY', price: '1500.00' });
	});

	it('lists worth over the period, narrowed to an account only when one is given', async () => {
		const listed = vi.fn().mockResolvedValue(empty);
		useApi({ accounts: { listWorth: listed } });

		await listWorth({ handle: 'home', day, period: month, account: null });
		await listWorth({ handle: 'home', day, period: month, account: 'Assets:Bank' });

		const span = { handle: 'home', from: '2026-09-01', to: '2026-09-01' };
		expect(listed).toHaveBeenNthCalledWith(1, { ...span, account: undefined });
		expect(listed).toHaveBeenNthCalledWith(2, { ...span, account: 'Assets:Bank' });
	});

	it('lists spending against the period before it, when there is one', async () => {
		const listed = vi.fn().mockResolvedValue(empty);
		useApi({ accounts: { listDeltas: listed } });

		await listDeltas({ handle: 'home', day, period: month, account: 'Expenses' });
		await listDeltas({ handle: 'home', day, period: { kind: 'all' }, account: 'Expenses' });

		const spans = (call: number) => listed.mock.calls[call]?.[0].spans;
		expect(spans(0)).toEqual([
			{ from: '2026-09-01', to: '2026-09-01' },
			{ from: '2026-08-01', to: '2026-08-01' },
		]);
		expect(spans(1)).toHaveLength(1);
	});

	it('asks the other reads over the days of the period, written out', async () => {
		const listed = vi.fn().mockResolvedValue(empty);
		useApi({
			accounts: {
				listInvested: listed,
				findBridge: listed,
				listDrops: listed,
				listReturns: listed,
				listDailyDeltas: listed,
			},
		});
		const asked = { handle: 'home', day, period: month };

		await listInvested({ ...asked, account: null });
		await findBridge(asked);
		await listDrops({ ...asked, account: null });
		await listReturns(asked);
		await listDailyDeltas({ ...asked, account: 'Expenses' });

		const span = { handle: 'home', from: '2026-09-01', to: '2026-09-01' };
		expect(listed.mock.calls.map(([input]) => input)).toEqual([
			{ ...span, account: null },
			span,
			{ ...span, account: null },
			span,
			{ ...span, account: 'Expenses' },
		]);
	});

	it('asks for the account tree, the names under a prefix and the terms of a day', async () => {
		const tree = vi.fn().mockResolvedValue([]);
		const names = vi.fn().mockResolvedValue([]);
		const terms = vi.fn().mockResolvedValue({});
		useApi({ accounts: { listTree: tree, listNames: names, listTerms: terms } });

		await listAccountTree('home');
		await listAccountNames({ handle: 'home', prefix: 'Ex' });
		await listTerms({ handle: 'home', day });

		expect(tree).toHaveBeenCalledWith({ handle: 'home' });
		expect(names).toHaveBeenCalledWith({ handle: 'home', prefix: 'Ex' });
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
		useApi({ accounts: { list: () => Promise.reject(refused) } });

		const accounts = await listAccounts({ handle: 'gone', day, period: month });

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
