import { provide } from '#lib/server/shared/context/context.ts';
import { petName } from '#lib/server/shared/names.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import * as Files from '#services/ledger/application/files.ts';
import { issues, listed } from '#services/ledger/tests/fixtures/files.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
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

	describe('a transfer each statement saw one side of', () => {
		const sent = (date: string, other = 'Expenses:Unknown') =>
			`${date} NEFT TO SBI\n\t${other} 1000\n\tAssets:HDFC\n`;
		const received = (date: string, other = 'Income:Unknown') =>
			`${date} NEFT FROM HDFC\n\t${other} -1000\n\tAssets:SBI\n`;

		const suggestFor = async (db: Parameters<typeof createLedger>[0], a: string, b: string) => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupea', content: a });
			await Files.createFile({ ledger, key: 'sbi.rupea', content: b });
			return { ledger, found: await Refinement.listSuggestions({ ledger, file: 'sbi.rupea' }) };
		};

		it('is suggested, and accepting it counts the money once', ({ context, db }) =>
			provide(context, async () => {
				const { ledger, found } = await suggestFor(db, sent('2026-10-03'), received('2026-10-03'));
				const suggestions = found._unsafeUnwrap();
				expect(suggestions).toHaveLength(1);

				expect(await Groups.linkGroups({ ledger, edits: edits(suggestions) })).toEqual(ok([]));
				const hdfcFile = (await Files.readFile({ ledger, key: 'hdfc.rupea' }))._unsafeUnwrap();
				const sbiFile = (await Files.readFile({ ledger, key: 'sbi.rupea' }))._unsafeUnwrap();
				expect(hdfcFile.content).toContain('\tAssets:SBI 1000\n\tAssets:HDFC\n');
				expect(sbiFile.content).toContain('\tAssets:HDFC -1000\n\tAssets:SBI\n');
				expect(await issues(ledger)).toEqual(ok([]));
				expect((await listed(ledger)).filter((t) => t.counted)).toHaveLength(1);
			}));

		it('is suggested up to two days apart, and no further', ({ context, db }) =>
			provide(context, async () => {
				const near = await suggestFor(db, sent('2026-10-03'), received('2026-10-05'));
				expect(near.found._unsafeUnwrap()).toHaveLength(1);

				const far = await suggestFor(db, sent('2026-10-03'), received('2026-10-06'));
				expect(far.found._unsafeUnwrap()).toHaveLength(0);
			}));

		it('is not suggested when a side posts to two balance accounts', ({ context, db }) =>
			provide(context, async () => {
				const split =
					'2026-10-03 NEFT TO SBI\n\tAssets:HDFC -1000\n\tAssets:Cash 400\n\tExpenses:Unknown 600\n';
				const { found } = await suggestFor(db, split, received('2026-10-03'));
				expect(found._unsafeUnwrap()).toHaveLength(0);
			}));

		it('is only ever a possible match, whatever the descriptions say', ({ context, db }) =>
			provide(context, async () => {
				const same = (other: string, sign: string) =>
					`2026-10-03 NEFT TRANSFER\n\t${other} ${sign}1000\n\t${sign === '' ? 'Assets:HDFC' : 'Assets:SBI'}\n`;
				const { found } = await suggestFor(
					db,
					same('Expenses:Unknown', ''),
					same('Income:Unknown', '-'),
				);
				expect(found._unsafeUnwrap().map((s) => s.confidence)).toEqual(['possible']);
			}));

		it('finishes when only the first file was written', ({ context, db }) =>
			provide(context, async () => {
				const { ledger, found } = await suggestFor(db, sent('2026-10-03'), received('2026-10-03'));
				const [transfer] = found._unsafeUnwrap();
				const primary = edits([transfer as Refinement.Suggestion]).filter(
					(e) => e.role === 'primary',
				);
				expect(await Groups.linkGroups({ ledger, edits: primary })).toEqual(ok([]));

				const again = (
					await Refinement.listSuggestions({ ledger, file: 'sbi.rupea' })
				)._unsafeUnwrap();
				expect(again.map((s) => [s.group, s.links.map((l) => l.role)])).toEqual([
					[transfer?.group, ['evidence']],
				]);
				expect(await Groups.linkGroups({ ledger, edits: edits(again) })).toEqual(ok([]));
				expect(await issues(ledger)).toEqual(ok([]));
				expect((await listed(ledger)).filter((t) => t.counted)).toHaveLength(1);
			}));

		it('is not suggested when a side already has a category', ({ context, db }) =>
			provide(context, async () => {
				const { found } = await suggestFor(
					db,
					sent('2026-10-03', 'Expenses:Family'),
					received('2026-10-03'),
				);
				expect(found._unsafeUnwrap()).toHaveLength(0);
			}));
	});

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

			expect(failed).toMatchObject([{ type: 'StorageNotFound', key: 'hdfc.rupea' }]);
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
