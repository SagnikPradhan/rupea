import { provide } from '#lib/server/shared/context/context.ts';
import { petName } from '#lib/server/shared/names.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import * as Files from '#services/ledger/application/files.ts';
import { issues, listed } from '#services/ledger/tests/fixtures/files.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { afterEach, describe, expect, vi } from 'vitest';
import * as Refinement from '#services/refinement/application/refinement.ts';

vi.mock(import('#lib/server/shared/names.ts'), async (original) => {
	const names = await original();
	return { ...names, petName: vi.fn(names.petName) };
});

// Pins the pet names in group names, in order.
const naming = (...names: string[]) =>
	names.forEach((n) => vi.mocked(petName).mockReturnValueOnce(n));

afterEach(() => {
	vi.mocked(petName).mockReset();
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
	s.flatMap((x) => x.links.map((l) => ({ ...l, group: x.group ?? '' })));

describe('refining a saved file', () => {
	it('suggests a group across files, and accepting it counts the money once', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });

			const suggestions = (
				await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })
			)._unsafeUnwrap();
			expect(suggestions).toHaveLength(1);
			const [transfer] = suggestions;
			expect(transfer?.group).toMatch(/^2026-10-03-deposit-[a-z]+-[a-z]+$/);
			expect(transfer?.links.map((l) => [l.file, l.line, l.role])).toEqual([
				['ibkr.rupea', 1, 'primary'],
				['hdfc.rupea', 1, 'evidence'],
			]);

			expect(await Groups.linkGroups({ ledger, edits: edits(suggestions) })).toEqual(ok([]));
			expect(
				(await Files.readFile({ ledger, key: 'hdfc.rupea' }))._unsafeUnwrap().content,
			).toContain(`2026-10-03 NEFT TO INTERACTIVE BROKERS\n\t- same-as: ${transfer?.group}\n`);
			expect(await issues(ledger)).toEqual(ok([]));
			const rows = await listed(ledger);
			expect(rows.filter((t) => !t.counted).map((t) => t.description)).toEqual([
				'NEFT TO INTERACTIVE BROKERS',
			]);
			expect(await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })).toEqual(ok([]));
		}));

	it('stops suggesting a pair once it is dismissed', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });

			const [transfer] = (
				await Refinement.listSuggestions({ ledger, file: 'hdfc.rupea' })
			)._unsafeUnwrap();
			await Refinement.dismissSuggestion({ ledger, fingerprint: transfer?.fingerprint ?? '' });

			expect(await Refinement.listSuggestions({ ledger, file: 'hdfc.rupea' })).toEqual(ok([]));
			expect(await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })).toEqual(ok([]));
		}));

	it('reports a file that changed since the suggestion, and writes no file', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });
			const suggestions = (
				await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })
			)._unsafeUnwrap();

			const file = (await Files.readFile({ ledger, key: 'hdfc.rupea' }))._unsafeUnwrap();
			await Files.editFile({
				ledger,
				key: 'hdfc.rupea',
				content: `; moved\n${hdfc}`,
				version: file.version,
			});

			expect(await Groups.linkGroups({ ledger, edits: edits(suggestions) })).toEqual(
				ok([{ type: 'GroupStale', location: 'hdfc.rupea:1' }]),
			);
			expect((await Files.readFile({ ledger, key: 'ibkr.rupea' }))._unsafeUnwrap().content).toBe(
				ibkr,
			);
		}));

	it('reports a file deleted since the suggestion, and writes no file', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });
			const suggestions = (
				await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })
			)._unsafeUnwrap();
			await Files.deleteFiles({ ledger, keys: ['hdfc.rupea'] });

			const failed = (
				await Groups.linkGroups({ ledger, edits: edits(suggestions) })
			)._unsafeUnwrap();

			expect(failed).toMatchObject([{ type: 'CannotReadFile', path: 'hdfc.rupea' }]);
			expect((await Files.readFile({ ledger, key: 'ibkr.rupea' }))._unsafeUnwrap().content).toBe(
				ibkr,
			);
		}));

	it('picks another name when one is taken', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const taken = '2026-10-03-deposit-quiet-heron';
			await Files.createFile({
				ledger,
				key: 'cash.rupea',
				content: `2026-01-01 ATM\n\t- group: ${taken}\n\tAssets:Cash 5\n\tAssets:HDFC\n`,
			});
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });
			naming('quiet-heron', 'brave-otter');

			const [transfer] = (
				await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })
			)._unsafeUnwrap();

			expect(transfer?.group).toBe('2026-10-03-deposit-brave-otter');
		}));

	it('never gives two new groups in one go the same name', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'hdfc.rupea',
				content: [
					'2026-10-03 NEFT TO IBKR\n\tAssets:HDFC -1000\n\tAssets:IBKR\n',
					'2026-10-03 NEFT TO IBKR\n\tAssets:HDFC -2000\n\tAssets:IBKR\n',
				].join('\n'),
			});
			await Files.createFile({
				ledger,
				key: 'ibkr.rupea',
				content: [
					'2026-10-03 Deposit\n\tAssets:IBKR 1000\n\tAssets:HDFC\n',
					'2026-10-03 Deposit\n\tAssets:IBKR 2000\n\tAssets:HDFC\n',
				].join('\n'),
			});
			naming('quiet-heron', 'quiet-heron', 'brave-otter');

			const named = (
				await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })
			)._unsafeUnwrap();

			expect(named.map((n) => n.group)).toEqual([
				'2026-10-03-deposit-quiet-heron',
				'2026-10-03-deposit-brave-otter',
			]);
		}));

	it('adds a transaction to the group its partner is already in', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({
				ledger,
				key: 'ibkr.rupea',
				content: ibkr.replace('Deposit\n', 'Deposit\n\t- group: ibkr-funding\n'),
			});

			const suggestions = (
				await Refinement.listSuggestions({ ledger, file: 'hdfc.rupea' })
			)._unsafeUnwrap();
			expect(suggestions.map((x) => x.group)).toEqual(['ibkr-funding']);

			expect(await Groups.linkGroups({ ledger, edits: edits(suggestions) })).toEqual(ok([]));
			expect(
				(await Files.readFile({ ledger, key: 'hdfc.rupea' }))._unsafeUnwrap().content,
			).toContain('NEFT TO INTERACTIVE BROKERS\n\t- same-as: ibkr-funding\n');
		}));

	it('gives up after a few names are all taken', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const taken = '2026-10-03-deposit-quiet-heron';
			await Files.createFile({
				ledger,
				key: 'cash.rupea',
				content: `2026-01-01 ATM\n\t- group: ${taken}\n\tAssets:Cash 5\n\tAssets:HDFC\n`,
			});
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });
			vi.mocked(petName).mockReturnValue('quiet-heron');

			expect(await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })).toEqual(
				err({ type: 'GroupIdTaken', group: taken }),
			);
		}));

	it('suggests nothing for charges that only share a category, or sit in one file', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const tea = '2026-10-03 TEA\n\tAssets:Bank -10\n\tExpenses:Food\n\n';
			await Files.createFile({ ledger, key: 'a.rupea', content: `${tea}${tea}` });
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
			await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });

			expect(await Refinement.listSuggestions({ ledger, file: 'a.rupea' })).toEqual(ok([]));
			await Files.createFile({
				ledger,
				key: 'usd.rupea',
				content: '2026-10-03 Deposit\n\tAssets:IBKR 1000 USD @ 83\n\tAssets:HDFC\n',
			});
			const forIbkr = (
				await Refinement.listSuggestions({ ledger, file: 'ibkr.rupea' })
			)._unsafeUnwrap();
			expect(forIbkr.map((s) => [s.ours.description, s.theirs.location.file])).toEqual([
				['Deposit', 'hdfc.rupea'],
			]);
		}));
});
