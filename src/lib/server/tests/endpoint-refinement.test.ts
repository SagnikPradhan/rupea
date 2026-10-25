import { createFile } from '#lib/endpoints/files.remote.ts';
import {
	dismissSuggestion,
	linkEvents,
	listEvents,
	listSuggestions,
	makePrimary,
	renameEvent,
} from '#lib/endpoints/refinement.remote.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { signIn } from '#tests/shared/app-server.ts';
import { createLedger, ownerOf } from '#tests/shared/seed.ts';
import { it as base } from '#tests/shared/vitest.ts';
import { describe, expect, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const hdfc = '2026-10-03 NEFT TO INTERACTIVE BROKERS\n\tAssets:HDFC -1000\n\tAssets:IBKR\n';
const ibkr = '2026-10-03 Deposit\n\tAssets:IBKR 1000\n\tAssets:HDFC\n';

/** A ledger its owner is signed in to, where a transfer shows in both banks' files. */
const it = base.extend<{ ledger: string }>({
	ledger: async ({ context, db }, use) => {
		const ledger = await createLedger(db);
		const handle = ledger.handle;
		signIn(ownerOf(ledger));
		await provide(context, async () => {
			await createFile({ handle, key: 'hdfc.rupea', content: hdfc });
			await createFile({ handle, key: 'ibkr.rupea', content: ibkr });
		});
		await use(handle);
		signIn(null);
	},
});

describe('a suggested event', () => {
	it('is linked, renamed and given a new primary', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const [transfer] = (await listSuggestions({ handle, file: 'ibkr.rupea' })).data ?? [];
			const event = transfer?.event ?? '';
			const edits = (transfer?.links ?? []).map((l) => ({ ...l, event }));
			expect(await linkEvents({ handle, edits })).toMatchObject({ ok: true });

			const renamed = await renameEvent({ handle, file: 'ibkr.rupea', event, to: 'transfer' });
			const member = { file: 'hdfc.rupea', line: 1 };
			const made = await makePrimary({ handle, file: 'ibkr.rupea', event: 'transfer', member });
			expect(renamed.ok).toBe(true);
			expect(made.ok).toBe(true);

			const [listed] = (await listEvents({ handle, file: 'ibkr.rupea' })).data ?? [];
			expect(listed?.members.map((m) => [m.file, m.role])).toEqual([
				['hdfc.rupea', 'primary'],
				['ibkr.rupea', 'evidence'],
			]);
		}));

	it('is no longer suggested once dismissed', ({ context, ledger: handle }) =>
		provide(context, async () => {
			const [transfer] = (await listSuggestions({ handle, file: 'hdfc.rupea' })).data ?? [];
			const fingerprint = transfer?.fingerprint ?? '';

			expect(await dismissSuggestion({ handle, file: 'hdfc.rupea', fingerprint })).toMatchObject({
				ok: true,
			});
			expect(await listSuggestions({ handle, file: 'hdfc.rupea' })).toMatchObject({ data: [] });
		}));

	it('refuses an event id of more than one word', ({ context, ledger: handle }) =>
		provide(context, async () => {
			await expect(
				renameEvent({ handle, file: 'ibkr.rupea', event: 'a', to: 'two words' }),
			).rejects.toThrow('Invalid input');
		}));
});
