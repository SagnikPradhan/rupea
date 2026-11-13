import { ORPCError } from '@orpc/client';
import { findFirstDay, findSync, listProblems, resync } from '#lib/endpoints/ledger.remote.ts';
import { refreshed, useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

describe('a ledger', () => {
	it('answers a ledger with no problems as a success', async () => {
		useApi({ listProblems: () => Promise.resolve({ succeeded: [], failed: [] }) });

		expect(await listProblems('home')).toEqual({ ok: true, data: [], errors: [] });
	});

	it('keeps the problems it was refused with beside the failure', async () => {
		const problem = { type: 'ReturnUnsolved', account: 'Assets:Broker' } as const;
		useApi({ listProblems: () => Promise.resolve({ succeeded: [], failed: [problem] }) });

		expect(await listProblems('home')).toEqual({ ok: false, data: [], errors: [problem] });
	});

	it('answers the first day, and none before a first transaction', async () => {
		const found = vi.fn().mockResolvedValueOnce('2026-08-01').mockResolvedValueOnce(null);
		useApi({ findFirstDay: found });

		expect((await findFirstDay('home')).data).toBe('2026-08-01');
		expect((await findFirstDay('home')).data).toBeNull();
		expect(found).toHaveBeenCalledWith({ handle: 'home' });
	});

	it('answers a ledger that is not found as the failure it was refused with', async () => {
		const missing = { type: 'LedgerNotFound', handle: 'gone' } as const;
		const refused = new ORPCError('MISSING', { status: 404, defined: true, data: missing });
		useApi({ findSync: () => Promise.reject(refused) });

		expect(await findSync('gone')).toEqual({ ok: false, data: null, errors: [missing] });
	});

	it('queues a sync and then reads how it stands', async () => {
		const queued = vi.fn().mockResolvedValue(undefined);
		useApi({ resync: queued });

		expect(await resync('home')).toEqual({ ok: true, data: undefined, errors: [] });
		expect(queued).toHaveBeenCalledWith({ handle: 'home' });
		expect(refreshed()).toEqual([{ remote: findSync, input: 'home' }]);
	});

	it('refuses a handle that is not one', async () => {
		useApi({});

		await expect(findFirstDay('Not A Handle')).rejects.toThrow('Invalid input');
	});
});
