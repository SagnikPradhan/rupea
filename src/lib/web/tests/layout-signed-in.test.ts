import { load as loadLedger } from '#routes/(signed-in)/l/[handle]/+layout.server.ts';
import { load as loadLedgers } from '#routes/(signed-in)/+layout.server.ts';
import type { User } from '@rupea/contract/auth.ts';
import { describe, expect, it, vi } from 'vitest';

const user: User = { id: 'u1', email: 'ada@example.com', username: 'ada' };
const ledgers = [
	{ handle: 'home', name: 'Home', owned: true },
	{ handle: 'shared', name: 'Shared', owned: false },
];

const event = (listLedgers: () => Promise<unknown>, signedIn: User | null = user) =>
	({ locals: { user: signedIn, api: { listLedgers } }, params: { handle: 'home' } }) as never;

describe('the signed-in layout', () => {
	it('lists the ledgers the server says the user may open', async () => {
		const listed = vi.fn().mockResolvedValue(ledgers);

		expect(await loadLedgers(event(listed))).toEqual({ ledgers, failure: null });
	});

	it('lists none when the server cannot say', async () => {
		const listed = () => Promise.reject(new TypeError('fetch failed'));

		expect(await loadLedgers(event(listed))).toEqual({
			ledgers: [],
			failure: 'UnknownError',
		});
	});

	it('sends a visitor to sign in without asking the server', async () => {
		const listed = vi.fn();

		await expect(loadLedgers(event(listed, null))).rejects.toMatchObject({
			status: 303,
			location: '/sign-in',
		});
		expect(listed).not.toHaveBeenCalled();
	});
});

const parent = (listLedgers: () => Promise<unknown>) => async () =>
	(await loadLedgers(event(listLedgers))) as { ledgers: typeof ledgers; failure: null };

const ledgerEvent = (listLedgers: () => Promise<unknown>) =>
	({ params: { handle: 'home' }, parent: parent(listLedgers) }) as never;

describe('the layout of a ledger', () => {
	it('opens a ledger of the list, naming it', async () => {
		const loaded = await loadLedger(ledgerEvent(() => Promise.resolve(ledgers)));

		expect(loaded).toEqual({ ledger: { handle: 'home', name: 'Home' } });
	});

	it('is missing for a handle the list does not hold', async () => {
		const listed = () => Promise.resolve([ledgers[1]]);

		await expect(loadLedger(ledgerEvent(listed))).rejects.toMatchObject({ status: 404 });
	});

	it('fails with the error when the list could not be had, not as a missing ledger', async () => {
		const listed = () => Promise.reject(new TypeError('fetch failed'));

		await expect(loadLedger(ledgerEvent(listed))).rejects.toMatchObject({
			status: 500,
			body: { message: 'UnknownError' },
		});
	});

	it('asks the server for the list once, through the layout above', async () => {
		const listed = vi.fn().mockResolvedValue(ledgers);

		await loadLedger(ledgerEvent(listed));

		expect(listed).toHaveBeenCalledOnce();
	});
});
