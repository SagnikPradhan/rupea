import { provide } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, errAsync, ok } from '#lib/server/shared/result/result.ts';
import * as Events from '#services/ledger/application/events.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { issues, listed } from './fixtures/files';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { afterEach, describe, expect, vi } from 'vitest';

vi.mock(import('#services/ledger/application/files.ts'), async (original) => {
	const files = await original();
	return { ...files, readFile: vi.fn(files.readFile) };
});

afterEach(() => {
	vi.mocked(Files.readFile).mockReset();
});

describe('changing an event', () => {
	const hdfc = [
		'2026-10-03 NEFT TO INTERACTIVE BROKERS',
		'\tAssets:HDFC -1000',
		'\tAssets:IBKR',
		'',
		'2026-10-03 SWIGGY',
		'\tAssets:HDFC -450',
		'\tExpenses:Food',
		'',
	].join('\n');

	const ibkr = [
		'2026-10-03 Deposit',
		'\tAssets:IBKR 1000',
		'\tAssets:HDFC',
		'',
		'2026-10-03 ZOMATO',
		'\tLiabilities:Card -450',
		'\tExpenses:Food',
		'',
	].join('\n');

	const linkedHdfc = hdfc.replace(
		'NEFT TO INTERACTIVE BROKERS\n',
		'NEFT TO INTERACTIVE BROKERS\n\t- same-as: transfer-otter\n',
	);
	const linkedIbkr = ibkr.replace('Deposit\n', 'Deposit\n\t- event: transfer-otter\n');

	const counted = async (ledger: Ledger.Ledger) =>
		(await listed(ledger)).filter((t) => !t.counted).map((t) => t.description);

	it('lists the events a file takes part in, with members from every file', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: linkedHdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: linkedIbkr });

			const events = (await Events.listEvents({ ledger, file: 'hdfc.rupee' }))._unsafeUnwrap();
			expect(
				events.map((e) => [e.event, e.members.map((m) => [m.location.file, m.role, m.counted])]),
			).toEqual([
				[
					'transfer-otter',
					[
						['hdfc.rupee', 'evidence', false],
						['ibkr.rupee', 'primary', true],
					],
				],
			]);
		}));

	it('makes evidence the primary, and the old primary evidence', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: linkedHdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: linkedIbkr });

			expect(
				await Events.makePrimary({
					ledger,
					event: 'transfer-otter',
					file: 'hdfc.rupee',
					line: 1,
				}),
			).toEqual(ok([]));
			expect((await Files.readFile({ ledger, key: 'hdfc.rupee' }))._unsafeUnwrap().content).toBe(
				linkedHdfc.replace('same-as:', 'event:'),
			);
			expect((await Files.readFile({ ledger, key: 'ibkr.rupee' }))._unsafeUnwrap().content).toBe(
				linkedIbkr.replace('event:', 'same-as:'),
			);
			expect(await issues(ledger)).toEqual(ok([]));
			expect(await counted(ledger)).toEqual(['Deposit']);
		}));

	it('refuses to make primary a transaction outside the event', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: linkedHdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: linkedIbkr });

			expect(
				(
					await Events.makePrimary({
						ledger,
						event: 'transfer-otter',
						file: 'hdfc.rupee',
						line: 6,
					})
				)._unsafeUnwrapErr(),
			).toEqual({ type: 'EventStale', location: 'hdfc.rupee:6' });
		}));

	it('renames an event in every file, and refuses a name in use', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: linkedHdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: linkedIbkr });
			await Files.createFile({
				ledger,
				key: 'cash.rupee',
				content: '2026-10-04 ATM\n\t- event: taken\n\tAssets:Cash 5\n\tAssets:HDFC\n',
			});

			expect(await Events.renameEvent({ ledger, event: 'transfer-otter', to: 'taken' })).toEqual(
				err({ type: 'EventIdTaken', event: 'taken' }),
			);
			expect(
				await Events.renameEvent({ ledger, event: 'transfer-otter', to: 'ibkr-funding' }),
			).toEqual(ok([]));
			expect((await Files.readFile({ ledger, key: 'hdfc.rupee' }))._unsafeUnwrap().content).toBe(
				linkedHdfc.replace('transfer-otter', 'ibkr-funding'),
			);
			expect((await Files.readFile({ ledger, key: 'ibkr.rupee' }))._unsafeUnwrap().content).toBe(
				linkedIbkr.replace('transfer-otter', 'ibkr-funding'),
			);
			expect(await issues(ledger)).toEqual(ok([]));
			expect(await counted(ledger)).toEqual(['NEFT TO INTERACTIVE BROKERS']);
		}));

	it('writes no file of the event when one cannot be read', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: linkedHdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: linkedIbkr });
			const unreadable = fault('CannotReadFile', { path: 'hdfc.rupee', reason: 'gone' });
			const content = async (key: string) =>
				(await Files.readFile({ ledger, key: key }))._unsafeUnwrap().content;

			vi.mocked(Files.readFile).mockReturnValueOnce(errAsync(unreadable));
			expect(
				await Events.renameEvent({ ledger, event: 'transfer-otter', to: 'ibkr-funding' }),
			).toEqual(ok([unreadable]));

			vi.mocked(Files.readFile).mockReturnValueOnce(errAsync(unreadable));
			expect(
				await Events.makePrimary({ ledger, event: 'transfer-otter', file: 'hdfc.rupee', line: 1 }),
			).toEqual(ok([unreadable]));

			expect(await Promise.all([content('hdfc.rupee'), content('ibkr.rupee')])).toEqual([
				linkedHdfc,
				linkedIbkr,
			]);
		}));
});
