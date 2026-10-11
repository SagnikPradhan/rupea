import { randomInt } from 'node:crypto';
import { afterEach, describe, expect, vi } from 'vitest';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { provide } from '#lib/server/shared/context.ts';
import { err, ok } from '#lib/server/shared/result.ts';
import { createUser } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { ADJECTIVES, ANIMALS } from '../domain/ids';
import * as Refinement from './refinement';

vi.mock('node:crypto', async (original) => {
	const crypto = await original<typeof import('node:crypto')>();
	return { ...crypto, randomInt: vi.fn(crypto.randomInt) };
});

// Pins the random words in event names to the given indices, in order.
const picking = (...indices: number[]) =>
	indices.forEach((i) => vi.mocked(randomInt).mockReturnValueOnce(i as never));

afterEach(() => {
	vi.mocked(randomInt).mockReset();
});

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

const edits = (s: Refinement.Suggestion[]) =>
	s.flatMap((x) => x.links.map((l) => ({ ...l, event: x.event ?? '' })));

describe('refining a saved file', () => {
	it('suggests an event across files, and accepting it counts the money once', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });

			const suggestions = (await Refinement.suggestFor(userId, 'ibkr.rupee'))._unsafeUnwrap();
			expect(suggestions).toHaveLength(1);
			const [transfer] = suggestions;
			expect(transfer?.event).toMatch(/^2026-10-03-deposit-[a-z]+-[a-z]+$/);
			expect(transfer?.links.map((l) => [l.file, l.line, l.role])).toEqual([
				['ibkr.rupee', 1, 'primary'],
				['hdfc.rupee', 1, 'evidence'],
			]);

			expect(await Refinement.accept(userId, edits(suggestions))).toEqual(ok([]));
			expect((await Ledger.getFile(userId, 'hdfc.rupee'))._unsafeUnwrap().content).toContain(
				`2026-10-03 NEFT TO INTERACTIVE BROKERS\n\t- same-as: ${transfer?.event}\n`,
			);
			expect(await Ledger.sync(userId)).toEqual(ok([]));
			const listed = (await Ledger.getTransactions(userId))._unsafeUnwrap().succeeded;
			expect(listed.filter((t) => !t.counted).map((t) => t.description)).toEqual([
				'NEFT TO INTERACTIVE BROKERS',
			]);
			expect(await Refinement.suggestFor(userId, 'ibkr.rupee')).toEqual(ok([]));
		}));

	it('stops suggesting a pair once it is dismissed', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });

			const [transfer] = (await Refinement.suggestFor(userId, 'hdfc.rupee'))._unsafeUnwrap();
			await Refinement.dismiss(userId, transfer?.fingerprint ?? '');

			expect(await Refinement.suggestFor(userId, 'hdfc.rupee')).toEqual(ok([]));
			expect(await Refinement.suggestFor(userId, 'ibkr.rupee')).toEqual(ok([]));
		}));

	it('reports a file that changed since the suggestion, and writes no file', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });
			const suggestions = (await Refinement.suggestFor(userId, 'ibkr.rupee'))._unsafeUnwrap();

			const file = (await Ledger.getFile(userId, 'hdfc.rupee'))._unsafeUnwrap();
			await Ledger.editFile({
				userId,
				key: 'hdfc.rupee',
				content: `; moved\n${hdfc}`,
				version: file.version,
			});

			expect(await Refinement.accept(userId, edits(suggestions))).toEqual(
				ok([{ type: 'RefinementStale', location: 'hdfc.rupee:1', cause: [] }]),
			);
			expect((await Ledger.getFile(userId, 'ibkr.rupee'))._unsafeUnwrap().content).toBe(ibkr);
		}));

	it('reports a file deleted since the suggestion, and writes no file', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });
			const suggestions = (await Refinement.suggestFor(userId, 'ibkr.rupee'))._unsafeUnwrap();
			await Ledger.deleteFile(userId, 'hdfc.rupee');

			const failed = (await Refinement.accept(userId, edits(suggestions)))._unsafeUnwrap();

			expect(failed).toMatchObject([{ type: 'CannotReadFile', path: 'hdfc.rupee' }]);
			expect((await Ledger.getFile(userId, 'ibkr.rupee'))._unsafeUnwrap().content).toBe(ibkr);
		}));

	it('picks another name when one is taken', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const taken = `2026-10-03-deposit-${ADJECTIVES[0]}-${ANIMALS[0]}`;
			await Ledger.createFile({
				userId,
				key: 'cash.rupee',
				content: `2026-01-01 ATM\n\t- event: ${taken}\n\tAssets:Cash 5\n\tAssets:HDFC\n`,
			});
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });
			picking(0, 0, 0, 1);

			const [transfer] = (await Refinement.suggestFor(userId, 'ibkr.rupee'))._unsafeUnwrap();

			expect(transfer?.event).toBe(`2026-10-03-deposit-${ADJECTIVES[0]}-${ANIMALS[1]}`);
		}));

	it('never gives two new events in one go the same name', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({
				userId,
				key: 'hdfc.rupee',
				content: [
					'2026-10-03 NEFT TO IBKR\n\tAssets:HDFC -1000\n\tAssets:IBKR\n',
					'2026-10-03 NEFT TO IBKR\n\tAssets:HDFC -2000\n\tAssets:IBKR\n',
				].join('\n'),
			});
			await Ledger.createFile({
				userId,
				key: 'ibkr.rupee',
				content: [
					'2026-10-03 Deposit\n\tAssets:IBKR 1000\n\tAssets:HDFC\n',
					'2026-10-03 Deposit\n\tAssets:IBKR 2000\n\tAssets:HDFC\n',
				].join('\n'),
			});
			picking(0, 0, 0, 0, 0, 1);

			const named = (await Refinement.suggestFor(userId, 'ibkr.rupee'))._unsafeUnwrap();

			expect(named.map((n) => n.event)).toEqual([
				`2026-10-03-deposit-${ADJECTIVES[0]}-${ANIMALS[0]}`,
				`2026-10-03-deposit-${ADJECTIVES[0]}-${ANIMALS[1]}`,
			]);
		}));

	it('adds a transaction to the event its partner is already in', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({
				userId,
				key: 'ibkr.rupee',
				content: ibkr.replace('Deposit\n', 'Deposit\n\t- event: ibkr-funding\n'),
			});

			const suggestions = (await Refinement.suggestFor(userId, 'hdfc.rupee'))._unsafeUnwrap();
			expect(suggestions.map((x) => x.event)).toEqual(['ibkr-funding']);

			expect(await Refinement.accept(userId, edits(suggestions))).toEqual(ok([]));
			expect((await Ledger.getFile(userId, 'hdfc.rupee'))._unsafeUnwrap().content).toContain(
				'NEFT TO INTERACTIVE BROKERS\n\t- same-as: ibkr-funding\n',
			);
		}));

	it('gives up after a few names are all taken', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const taken = `2026-10-03-deposit-${ADJECTIVES[0]}-${ANIMALS[0]}`;
			await Ledger.createFile({
				userId,
				key: 'cash.rupee',
				content: `2026-01-01 ATM\n\t- event: ${taken}\n\tAssets:Cash 5\n\tAssets:HDFC\n`,
			});
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });
			vi.mocked(randomInt).mockReturnValue(0 as never);

			expect(await Refinement.suggestFor(userId, 'ibkr.rupee')).toEqual(
				err({ type: 'RefinementNameTaken', event: taken, cause: [] }),
			);
		}));

	it('suggests nothing for charges that only share a category, or sit in one file', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const tea = '2026-10-03 TEA\n\tAssets:Bank -10\n\tExpenses:Food\n\n';
			await Ledger.createFile({ userId, key: 'a.rupee', content: `${tea}${tea}` });
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: hdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: ibkr });

			expect(await Refinement.suggestFor(userId, 'a.rupee')).toEqual(ok([]));
			await Ledger.createFile({
				userId,
				key: 'usd.rupee',
				content: '2026-10-03 Deposit\n\tAssets:IBKR 1000 USD @ 83\n\tAssets:HDFC\n',
			});
			const forIbkr = (await Refinement.suggestFor(userId, 'ibkr.rupee'))._unsafeUnwrap();
			expect(forIbkr.map((s) => [s.ours.description, s.theirs.location.file])).toEqual([
				['Deposit', 'hdfc.rupee'],
			]);
		}));
});

describe('changing an event', () => {
	const linkedHdfc = hdfc.replace(
		'NEFT TO INTERACTIVE BROKERS\n',
		'NEFT TO INTERACTIVE BROKERS\n\t- same-as: transfer-otter\n',
	);
	const linkedIbkr = ibkr.replace('Deposit\n', 'Deposit\n\t- event: transfer-otter\n');

	const counted = async (userId: string) =>
		(await Ledger.getTransactions(userId))
			._unsafeUnwrap()
			.succeeded.filter((t) => !t.counted)
			.map((t) => t.description);

	it('lists the events a file takes part in, with members from every file', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: linkedHdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: linkedIbkr });

			const events = (await Refinement.eventsIn(userId, 'hdfc.rupee'))._unsafeUnwrap();
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
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: linkedHdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: linkedIbkr });

			expect(
				await Refinement.makePrimary({
					userId,
					event: 'transfer-otter',
					file: 'hdfc.rupee',
					line: 1,
				}),
			).toEqual(ok([]));
			expect((await Ledger.getFile(userId, 'hdfc.rupee'))._unsafeUnwrap().content).toBe(
				linkedHdfc.replace('same-as:', 'event:'),
			);
			expect((await Ledger.getFile(userId, 'ibkr.rupee'))._unsafeUnwrap().content).toBe(
				linkedIbkr.replace('event:', 'same-as:'),
			);
			expect(await Ledger.sync(userId)).toEqual(ok([]));
			expect(await counted(userId)).toEqual(['Deposit']);
		}));

	it('refuses to make primary a transaction outside the event', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: linkedHdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: linkedIbkr });

			expect(
				(
					await Refinement.makePrimary({
						userId,
						event: 'transfer-otter',
						file: 'hdfc.rupee',
						line: 6,
					})
				)._unsafeUnwrapErr(),
			).toEqual({ type: 'RefinementStale', location: 'hdfc.rupee:6', cause: [] });
		}));

	it('renames an event in every file, and refuses a name in use', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Ledger.createFile({ userId, key: 'hdfc.rupee', content: linkedHdfc });
			await Ledger.createFile({ userId, key: 'ibkr.rupee', content: linkedIbkr });
			await Ledger.createFile({
				userId,
				key: 'cash.rupee',
				content: '2026-10-04 ATM\n\t- event: taken\n\tAssets:Cash 5\n\tAssets:HDFC\n',
			});

			expect(await Refinement.renameEvent(userId, 'transfer-otter', 'taken')).toEqual(
				err({ type: 'RefinementNameTaken', event: 'taken', cause: [] }),
			);
			expect(await Refinement.renameEvent(userId, 'transfer-otter', 'ibkr-funding')).toEqual(
				ok([]),
			);
			expect((await Ledger.getFile(userId, 'hdfc.rupee'))._unsafeUnwrap().content).toBe(
				linkedHdfc.replace('transfer-otter', 'ibkr-funding'),
			);
			expect((await Ledger.getFile(userId, 'ibkr.rupee'))._unsafeUnwrap().content).toBe(
				linkedIbkr.replace('transfer-otter', 'ibkr-funding'),
			);
			expect(await Ledger.sync(userId)).toEqual(ok([]));
			expect(await counted(userId)).toEqual(['NEFT TO INTERACTIVE BROKERS']);
		}));
});
