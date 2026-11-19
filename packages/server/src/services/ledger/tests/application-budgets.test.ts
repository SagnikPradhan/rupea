import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Budgets from '#services/ledger/application/budgets.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { parseAmount } from '#services/ledger/domain/amounts.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import * as Storage from '#lib/server/shared/storage/storage.ts';
import { describe, expect, vi } from 'vitest';

vi.mock(import('#lib/server/shared/storage/storage.ts'), async (original) => ({
	...(await original()),
	findText: vi.fn((await original()).findText),
}));

const budgeted = [
	'B * Expenses:Food',
	'- limit: 15000',
	'- period: month',
	'',
	'B 2027-04-01 Expenses:Food',
	'- limit: 18000',
	'',
].join('\n');

describe('indexing B lines', () => {
	it('holds each line with its date, account and keys', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'budgets.rupea', content: budgeted });

			const rows = await db
				.selectFrom('budgetLines')
				.select(['account', 'since', 'keys', 'line'])
				.where('ledgerId', '=', ledger.id)
				.orderBy('line')
				.execute();

			expect(rows).toEqual([
				{
					account: 'Expenses:Food',
					since: null,
					keys: { limit: ['15000'], period: ['month'] },
					line: 1,
				},
				{ account: 'Expenses:Food', since: '2027-04-01', keys: { limit: ['18000'] }, line: 5 },
			]);
		}));

	it('replaces them when the file changes', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const file = (
				await Files.createFile({ ledger, key: 'budgets.rupea', content: budgeted })
			)._unsafeUnwrap();
			const count = () =>
				db
					.selectFrom('budgetLines')
					.select((e) => e.fn.countAll<string>().as('n'))
					.where('ledgerId', '=', ledger.id)
					.executeTakeFirstOrThrow()
					.then((r) => Number(r.n));

			await Files.editFile({
				ledger,
				key: 'budgets.rupea',
				version: file.version,
				content: 'B * Expenses:Fuel\n- limit: 4000\n',
			});

			expect(await count()).toBe(1);
		}));

	it('reports a bad B line as a problem, with its file and line', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'budgets.rupea',
				content: 'B * Expenses:Food\n- limit: lots\n',
			});

			const failed = (await Sync.listProblems(ledger))._unsafeUnwrap().failed;

			expect(failed).toMatchObject([
				{ type: 'ParseInvalidBudget', location: 'budgets.rupea:1', key: 'limit' },
			]);
		}));
});

const spend = (day: string, account: string, amount: number) =>
	`${day} Spend\n\t${account} ${amount}\n\tAssets:Bank\n`;

const dated = <T extends { from: Temporal.PlainDate; to: Temporal.PlainDate }>(b: T) => ({
	...b,
	from: b.from.toString(),
	to: b.to.toString(),
});

const spent = (n: number) => parseAmount(String(n));

describe('listing budgets with what was spent', () => {
	const day = Temporal.PlainDate.from('2026-10-15');

	const seed = async (db: Parameters<typeof createLedger>[0], files: Record<string, string>) => {
		const ledger = await createLedger(db);
		for (const [key, content] of Object.entries(files))
			await Files.createFile({ ledger, key, content });

		return ledger;
	};

	it('counts a child in its parent, a refund back and a posting outside the month not at all', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n',
				'spend.rupea': [
					spend('2026-10-05', 'Expenses:Food:Lunch', 200),
					spend('2026-10-07', 'Expenses:Food', 100),
					spend('2026-10-09', 'Expenses:Food:Lunch', -50),
					spend('2026-09-30', 'Expenses:Food', 999),
					spend('2026-11-01', 'Expenses:Food', 999),
				].join('\n'),
			});

			const batch = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap();

			expect(batch.failed).toEqual([]);
			expect(batch.succeeded.map(dated)).toEqual([
				{
					account: 'Expenses:Food',
					length: 'month',
					from: '2026-10-01',
					to: '2026-10-31',
					limit: spent(1000),
					current: { limit: '1000' },
					spent: spent(250),
					left: spent(750),
				},
			]);
		}));

	it('reads April to March for a year that starts on 1 April', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea':
					'B * Expenses:Travel\n- limit: 5000\n- period: year\n- start: 2026-04-01\n',
				'spend.rupea': [
					spend('2026-03-31', 'Expenses:Travel', 900),
					spend('2026-04-01', 'Expenses:Travel', 100),
					spend('2026-12-25', 'Expenses:Travel', 200),
					spend('2027-03-31', 'Expenses:Travel', 300),
					spend('2027-04-01', 'Expenses:Travel', 900),
				].join('\n'),
			});

			const [travel] = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(dated(travel!)).toMatchObject({
				from: '2026-04-01',
				to: '2027-03-31',
				spent: spent(600),
				left: spent(4400),
			});
		}));

	it('reads only from a re-anchored period', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea':
					'B * Expenses:Food\n- limit: 1000\n\nB 2026-10-10 Expenses:Food\n- start: 2026-10-10\n',
				'spend.rupea': [
					spend('2026-10-05', 'Expenses:Food', 300),
					spend('2026-10-12', 'Expenses:Food', 40),
				].join('\n'),
			});

			const [food] = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2026-10-10',
				spent: spent(40),
			});
		}));

	it('shows a parent and a child budget their own spent', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea':
					'B * Expenses:Food\n- limit: 1000\n\nB * Expenses:Food:Lunch\n- limit: 300\n',
				'spend.rupea': [
					spend('2026-10-05', 'Expenses:Food:Lunch', 200),
					spend('2026-10-07', 'Expenses:Food', 100),
				].join('\n'),
			});

			const batch = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap();

			expect(batch.succeeded.map((b) => [b.account, b.spent, b.left])).toEqual([
				['Expenses:Food', spent(300), spent(700)],
				['Expenses:Food:Lunch', spent(200), spent(100)],
			]);
		}));

	it('reads more spans than it reads at once, each with its own spending', ({ context, db }) =>
		provide(context, async () => {
			const accounts = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n) => `Expenses:${n}`);
			const ledger = await seed(db, {
				'budgets.rupea': accounts
					.map((a, i) => `B * ${a}\n- limit: 1000\n- start: 2026-10-0${i + 1}\n`)
					.join('\n'),
				'spend.rupea': accounts
					.flatMap((a, i) => [
						spend(`2026-10-0${i + 1}`, a, 10 * (i + 1)),
						spend('2026-09-30', a, 1),
					])
					.join('\n'),
			});

			const batch = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap();

			expect(batch.succeeded.map((b) => [b.account, dated(b).from, b.spent])).toEqual(
				accounts.map((a, i) => [a, `2026-10-0${i + 1}`, spent(10 * (i + 1))]),
			);
		}));

	it('spends nothing on an account with no postings, and never fails for it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Fuel\n- limit: 400\n',
				'spend.rupea': spend('2026-10-05', 'Expenses:Food', 200),
			});

			const batch = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap();

			expect(batch.succeeded).toMatchObject([
				{ account: 'Expenses:Fuel', spent: spent(0), left: spent(400) },
			]);
		}));

	it('answers no budgets for a ledger with none', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, { 'spend.rupea': spend('2026-10-05', 'Expenses:Food', 1) });

			expect(
				(await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap().succeeded,
			).toEqual([]);
		}));

	it('counts postings on an account the B line writes in another case', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:food\n- limit: 1000\n',
				'spend.rupea': spend('2026-10-05', 'Expenses:Food', 200),
			});

			const [food] = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(food).toMatchObject({ spent: spent(200), left: spent(800) });
		}));

	it('adds the limit and the spending of each month of a range', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n',
				'spend.rupea': [
					spend('2026-07-31', 'Expenses:Food', 999),
					spend('2026-08-05', 'Expenses:Food', 100),
					spend('2026-09-05', 'Expenses:Food', 200),
					spend('2026-10-05', 'Expenses:Food', 300),
					spend('2026-11-01', 'Expenses:Food', 999),
				].join('\n'),
			});
			const from = Temporal.PlainDate.from('2026-08-01');

			const [food] = (await Budgets.listBudgets({ ledger, from, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2026-08-01',
				to: '2026-10-31',
				limit: spent(3000),
				spent: spent(600),
				left: spent(2400),
			});
		}));

	it('counts the months that start within a twelve month range as twelve', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n',
				'spend.rupea': [
					spend('2025-11-25', 'Expenses:Food', 999),
					spend('2025-12-05', 'Expenses:Food', 100),
					spend('2026-10-05', 'Expenses:Food', 300),
				].join('\n'),
			});
			const from = Temporal.PlainDate.from('2025-10-15');

			const [food] = (await Budgets.listBudgets({ ledger, from, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2025-11-01',
				limit: spent(12000),
				spent: spent(1399),
			});
		}));

	it('takes the limit in effect at the end of each month', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea':
					'B * Expenses:Food\n- limit: 1000\n\nB 2026-09-10 Expenses:Food\n- limit: 2000\n',
				'spend.rupea': [
					spend('2026-08-02', 'Expenses:Fuel', 1),
					spend('2026-10-05', 'Expenses:Food', 300),
				].join('\n'),
			});
			const from = Temporal.PlainDate.from('2026-08-01');

			const [food] = (await Budgets.listBudgets({ ledger, from, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(food).toMatchObject({ limit: spent(5000), spent: spent(300), left: spent(4700) });
		}));

	it('leaves out the months before the budget has a limit', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B 2026-09-10 Expenses:Food\n- limit: 1000\n',
				'spend.rupea': [
					spend('2026-08-05', 'Expenses:Food', 500),
					spend('2026-09-20', 'Expenses:Food', 100),
				].join('\n'),
			});
			const from = Temporal.PlainDate.from('2026-07-01');

			const [food] = (await Budgets.listBudgets({ ledger, from, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2026-09-01',
				limit: spent(2000),
				spent: spent(100),
			});
		}));

	it('shows what a past month spent when the range is inside it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n',
				'spend.rupea': [
					spend('2026-09-05', 'Expenses:Food', 200),
					spend('2026-10-05', 'Expenses:Food', 300),
				].join('\n'),
			});
			const september = Temporal.PlainDate.from('2026-09-15');

			const [food] = (
				await Budgets.listBudgets({ ledger, from: september, to: september })
			)._unsafeUnwrap().succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2026-09-01',
				to: '2026-09-30',
				limit: spent(1000),
				spent: spent(200),
			});
		}));

	it('adds a range for each account on its own', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n\nB * Expenses:Fuel\n- limit: 10\n',
				'spend.rupea': [
					spend('2026-01-02', 'Expenses:Fuel', 2),
					spend('2026-10-05', 'Expenses:Fuel', 3),
				].join('\n'),
			});
			const from = Temporal.PlainDate.from('2026-01-01');

			const batch = (await Budgets.listBudgets({ ledger, from, to: day }))._unsafeUnwrap();

			expect(batch.succeeded.map((b) => [b.account, b.limit, b.spent])).toEqual([
				['Expenses:Food', spent(10000), spent(0)],
				['Expenses:Fuel', spent(100), spent(5)],
			]);
		}));

	it('counts only the months from the first day of the ledger when the range starts before it', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n',
				'spend.rupea': [
					spend('2025-03-05', 'Expenses:Food', 100),
					spend('2025-05-05', 'Expenses:Food', 200),
				].join('\n'),
			});
			const from = Temporal.PlainDate.from('2000-01-01');
			const to = Temporal.PlainDate.from('2025-05-15');

			const [food] = (await Budgets.listBudgets({ ledger, from, to }))._unsafeUnwrap().succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2025-03-01',
				to: '2025-05-31',
				limit: spent(3000),
				spent: spent(300),
			});
		}));

	it('reaches back a hundred years from a ledger with no postings', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, { 'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n' });
			const from = Temporal.PlainDate.from('0001-01-01');

			const [food] = (await Budgets.listBudgets({ ledger, from, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(dated(food!)).toMatchObject({ from: '1926-10-01', spent: spent(0) });
		}));

	it('fails for a range that runs backwards', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seed(db, { 'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n' });
			const from = Temporal.PlainDate.from('2026-10-16');

			const listed = await Budgets.listBudgets({ ledger, from, to: day });

			expect(listed._unsafeUnwrapErr().type).toBe('SpanReversed');
		}));

	it('reads a monthly start across the new year and counts its first and last days', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await seed(db, {
				'budgets.rupea': 'B * Expenses:Food\n- limit: 1000\n- start: 2026-12-25\n',
				'spend.rupea': [
					spend('2026-12-24', 'Expenses:Food', 900),
					spend('2026-12-30', 'Expenses:Food', 100),
					spend('2027-01-10', 'Expenses:Food', 20),
					spend('2027-01-25', 'Expenses:Food', 900),
				].join('\n'),
			});
			const january = Temporal.PlainDate.from('2027-01-10');

			const [food] = (
				await Budgets.listBudgets({ ledger, from: january, to: january })
			)._unsafeUnwrap().succeeded;

			expect(dated(food!)).toMatchObject({
				from: '2026-12-25',
				to: '2027-01-24',
				spent: spent(120),
				left: spent(880),
			});
		}));
});

const food = (limit: string): [string, string][] => [['limit', limit]];

const seedFood = async (db: Parameters<typeof createLedger>[0]) => {
	const ledger = await createLedger(db);
	await Files.createFile({
		ledger,
		key: 'spend.rupea',
		content: spend('2026-10-01', 'Expenses:Food', 1),
	});

	return ledger;
};

describe('saving the budget of an account', () => {
	it('makes main.rupea on the first save, and lists it back', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seedFood(db);
			const day = Temporal.PlainDate.from('2026-10-15');

			const saved = await Budgets.saveBudget({
				ledger,
				account: 'Expenses:Food',
				entries: food('9000'),
			});
			const listed = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap()
				.succeeded;

			expect(saved._unsafeUnwrap()).toEqual({
				file: 'main.rupea',
				written: 'B * Expenses:Food\n\t- limit: 9000\n',
			});
			expect(listed).toMatchObject([{ account: 'Expenses:Food', limit: spent(9000) }]);
		}));

	it('changes the line in its file and keeps the comments below and an unknown key', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await seedFood(db);
			await Files.createFile({
				ledger,
				key: 'budgets.rupea',
				content:
					'B * Expenses:Food\n\t- limit: 100\n\n; below\nB 2027-04-01 Expenses:Food\n\t- limit: 1\n',
			});

			const saved = await Budgets.saveBudget({
				ledger,
				account: 'Expenses:Food',
				entries: [...food('200'), ['note', 'x']],
			});
			const file = (await Files.readFile({ ledger, key: 'budgets.rupea' }))._unsafeUnwrap();

			expect(saved._unsafeUnwrap().file).toBe('budgets.rupea');
			expect(file.content).toContain('B * Expenses:Food\n\t- limit: 200\n\t- note: x\n');
			expect(file.content).toContain('; below\n\nB 2027-04-01 Expenses:Food');
		}));

	it('will not save an account that two B * lines set up', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seedFood(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: 'B * Expenses:Food\n\t- limit: 1\n\nB * Expenses:Food\n\t- limit: 2\n',
			});

			const saved = await Budgets.saveBudget({
				ledger,
				account: 'Expenses:Food',
				entries: food('3'),
			});

			expect(saved._unsafeUnwrapErr().type).toBe('AccountRepeated');
		}));

	it('will not write over a file that changed since it was read', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seedFood(db);
			await Files.createFile({
				ledger,
				key: 'main.rupea',
				content: 'B * Expenses:Food\n\t- limit: 1\n',
			});
			const actual = await vi.importActual<typeof Storage>('#lib/server/shared/storage/storage.ts');
			vi.mocked(Storage.findText).mockImplementationOnce((s, k) =>
				actual.findText(s, k).map((f) => f && { ...f, version: 'old' }),
			);

			const saved = await Budgets.saveBudget({
				ledger,
				account: 'Expenses:Food',
				entries: food('2'),
			});

			expect(saved._unsafeUnwrapErr().type).toBe('StorageConflict');
		}));

	it('will not save an account the ledger does not know', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seedFood(db);

			const saved = await Budgets.saveBudget({
				ledger,
				account: 'Expenses:Nope',
				entries: food('3'),
			});

			expect(saved._unsafeUnwrapErr()).toEqual({
				type: 'AccountNotFound',
				account: 'Expenses:Nope',
			});
		}));

	it('saves a parent of a known account', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await seedFood(db);

			const saved = await Budgets.saveBudget({ ledger, account: 'Expenses', entries: food('4') });

			expect(saved.isOk()).toBe(true);
		}));

	it('writes a start in the first date format of a ledger and lists it back', ({ context, db }) =>
		provide(
			{
				...context,
				config: {
					...context.config,
					ledger: { ...context.config.ledger, dateFormats: ['dd/MM/yyyy'] },
				},
			},
			async () => {
				const ledger = await createLedger(db);
				await Files.createFile({
					ledger,
					key: 'spend.rupea',
					content: spend('01/10/2026', 'Expenses:Food', 1),
				});
				const day = Temporal.PlainDate.from('2026-10-15');

				const saved = await Budgets.saveBudget({
					ledger,
					account: 'Expenses:Food',
					entries: [...food('100'), ['start', '2026-10-05']],
				});
				const listed = (await Budgets.listBudgets({ ledger, from: day, to: day }))._unsafeUnwrap();

				expect(saved._unsafeUnwrap()).toEqual({
					file: 'main.rupea',
					written: 'B * Expenses:Food\n\t- limit: 100\n\t- start: 05/10/2026\n',
				});
				expect(listed.succeeded.map(dated)).toMatchObject([
					{ account: 'Expenses:Food', from: '2026-10-05', to: '2026-11-04', limit: spent(100) },
				]);
			},
		));
});
