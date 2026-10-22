import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { EMBEDDING_DIMENSIONS } from '#lib/server/shared/onnx/models.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, ok } from '#lib/server/shared/result/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import {
	ledgerFiles,
	lots,
	metadata,
	prices,
	symbols,
	transactions,
} from '#services/ledger/adapters/database-schema.ts';
import { MODEL } from '#services/ledger/adapters/prediction-onnx.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { PriceSource } from '#services/ledger/domain/types.ts';
import { broken } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import {
	groceries,
	issues,
	listAllTransactions,
	listed,
	put,
	salary,
	stored,
	summary,
} from './fixtures/files';

const annotated = [
	'- statement: hdfc-oct.pdf',
	'',
	'2026-08-29 Groceries',
	'\t- ref: a',
	'\t- note: weekly shop',
	'\t- ref: b',
	'\tExpenses:Food 100.5',
	'\t\t- tags: weekly',
	'\tAssets:Bank',
	'',
].join('\n');

const fileMetadata = async (db: Database, ledgerId: string) =>
	(
		await db
			.select({ key: metadata.key, value: metadata.value })
			.from(metadata)
			.innerJoin(ledgerFiles, eq(ledgerFiles.id, metadata.fileId))
			.where(eq(ledgerFiles.ledgerId, ledgerId))
			.orderBy(asc(metadata.position))
	).map((r) => [r.key, r.value]);

describe('syncing the ledger', () => {
	it('indexes new files, ordered by date', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', groceries);
			await put(storage, ledger, 'b/c.rupee', salary);
			await put(storage, ledger, 'notes.txt', 'not a ledger file');

			expect(await issues(ledger)).toEqual(ok([]));
			expect(await summary(ledger.id)).toEqual(['b/c.rupee:1 Salary', 'a.rupee:1 Groceries']);
		}));

	it('indexes metadata of the file, its transactions and their postings', ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', annotated);
			await Sync.sync(ledger);

			const [indexed] = (await listAllTransactions(ledger.id))._unsafeUnwrap();
			expect(indexed?.metadata).toEqual({ ref: ['a', 'b'], note: ['weekly shop'] });
			expect(indexed?.postings.map((p) => p.metadata)).toEqual([{ tags: ['weekly'] }, {}]);
			expect(await fileMetadata(db, ledger.id)).toEqual([['statement', 'hdfc-oct.pdf']]);
		}));

	it('leaves no metadata behind when a file changes or goes', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			// Other tests share the database, so count only what this one adds.
			const before = await db.$count(metadata);
			await put(storage, ledger, 'a.rupee', annotated);
			await Sync.sync(ledger);
			expect(await db.$count(metadata)).toBe(before + 5);

			await put(storage, ledger, 'a.rupee', `- statement: other.pdf\n\n${groceries}`);
			await Sync.sync(ledger);
			expect(await db.$count(metadata)).toBe(before + 1);

			await stored(storage, ledger).delete('a.rupee');
			await Sync.sync(ledger);
			expect(await db.$count(metadata)).toBe(before);
		}));

	it('indexes market prices, replacing them when the file changes', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const bought = '2026-10-01 Buy INFY\n\tAssets:Zerodha 10 INFY @ 1500\n\tAssets:Bank\n';
			const indexed = () =>
				db
					.select({
						commodity: symbols.symbol,
						amount: prices.priceAmount,
						source: prices.source,
					})
					.from(prices)
					.innerJoin(symbols, eq(symbols.id, prices.symbolId))
					.where(eq(symbols.ledgerId, ledger.id))
					.orderBy(asc(prices.line));

			await put(storage, ledger, 'a.rupee', `${bought}\nP 2026-10-17 INFY 1820\n`);
			await Sync.sync(ledger);
			expect(await indexed()).toEqual([
				{ commodity: 'INFY', amount: 1500_0000000000n, source: PriceSource.Posting },
				{ commodity: 'INFY', amount: 1820_0000000000n, source: PriceSource.Line },
			]);

			await put(storage, ledger, 'a.rupee', 'P 2026-10-18 INFY 1830\nP 2026-10-18 TCS 4100\n');
			await Sync.sync(ledger);
			expect(await indexed()).toEqual([
				{ commodity: 'INFY', amount: 1830_0000000000n, source: PriceSource.Line },
				{ commodity: 'TCS', amount: 4100_0000000000n, source: PriceSource.Line },
			]);
		}));

	it('prices a commodity on one symbol across files, kept through a reindex', ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const own = () =>
				db
					.select({ id: symbols.id, symbol: symbols.symbol })
					.from(symbols)
					.where(eq(symbols.ledgerId, ledger.id))
					.orderBy(asc(symbols.symbol));

			await put(storage, ledger, 'a.rupee', 'P 2026-10-17 INFY 1820\n');
			await put(storage, ledger, 'b.rupee', 'P 2026-10-18 INFY 1830\nP 2026-10-18 TCS 4100\n');
			await Sync.sync(ledger);
			const made = await own();

			await put(storage, ledger, 'a.rupee', 'P 2026-10-19 INFY 1840\n');
			await Sync.sync(ledger);
			expect(made.map((s) => s.symbol)).toEqual(['INFY', 'TCS']);
			expect(await own()).toEqual(made);
		}));

	it('indexes a lot cost and reads it back', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const sale = [
				'2026-10-01 Sell INFY',
				'\tAssets:Zerodha -4 INFY {1500, 2024-06-03} @ 1700',
				'\tAssets:Bank 6800',
				'\tIncome:Gains',
				'',
			].join('\n');
			await put(storage, ledger, 'a.rupee', sale);
			await Sync.sync(ledger);

			const [indexed] = (await listAllTransactions(ledger.id))._unsafeUnwrap();
			expect(indexed?.postings.map((p) => p.cost)).toEqual([
				{
					amount: 1500_0000000000n,
					commodity: 'INR',
					date: Temporal.PlainDate.from('2024-06-03'),
				},
				null,
				null,
			]);
		}));

	it('re-indexes changed files and drops deleted ones', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', groceries);
			await put(storage, ledger, 'b.rupee', salary);
			await Sync.sync(ledger);

			await put(storage, ledger, 'a.rupee', `${salary}${groceries}`);
			await stored(storage, ledger).delete('b.rupee');
			await Sync.sync(ledger);

			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Salary', 'a.rupee:4 Groceries']);
		}));

	it('keeps a description embedded through a re-index', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));
			await put(storage, ledger, 'a.rupee', groceries);
			await Sync.sync(ledger);
			await db
				.update(transactions)
				.set({ embedding: vector })
				.where(eq(transactions.ledgerId, ledger.id));

			await put(storage, ledger, 'a.rupee', `${salary}${groceries}`);
			await Sync.sync(ledger);

			const rows = await db
				.select({
					description: transactions.description,
					embedding: transactions.embedding,
					model: transactions.embeddingModel,
				})
				.from(transactions)
				.where(eq(transactions.ledgerId, ledger.id))
				.orderBy(asc(transactions.line));
			expect(rows).toEqual([
				{ description: 'Salary', embedding: expect.any(Array), model: MODEL },
				{ description: 'Groceries', embedding: vector, model: MODEL },
			]);
		}));

	it('reports parse errors on every sync until the file is fixed', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', `${groceries}2026-08-30 Bad\n\tbad posting x\n`);

			const problem = {
				type: 'ParseInvalidPosting',
				location: 'a.rupee:5',
			};
			expect(await issues(ledger)).toEqual(ok([problem]));
			expect(await issues(ledger)).toEqual(ok([problem]));
			// What did parse is indexed meanwhile.
			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Groceries']);

			await put(storage, ledger, 'a.rupee', groceries);
			expect(await issues(ledger)).toEqual(ok([]));
		}));

	it('orders a day by time, untimed first', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const body = '\tExpenses:Food 1\n\tAssets:Bank\n';
			await put(
				storage,
				ledger,
				'a.rupee',
				[
					`29 Aug 2026 9:15 pm Dinner\n${body}`,
					`29/08/2026 08:00 Breakfast\n${body}`,
					`2026-08-29 Untimed\n${body}`,
				].join('\n'),
			);
			await Sync.sync(ledger);

			expect(await summary(ledger.id)).toEqual([
				'a.rupee:9 Untimed',
				'a.rupee:5 Breakfast',
				'a.rupee:1 Dinner',
			]);
		}));

	it('keeps ledgers apart', ({ context, db, storage }) =>
		provide(context, async () => {
			const one = await createLedger(db);
			const two = await createLedger(db);
			await put(storage, one, 'a.rupee', groceries);
			await Sync.sync(one);
			await Sync.sync(two);

			expect(await summary(two.id)).toEqual([]);
		}));
});

describe('events across files', () => {
	const transfer = (role: string, amount: string) =>
		[
			'2026-10-03 NEFT IBKR',
			`\t- ${role}: 2026-10-03-ibkr-otter`,
			`\tAssets:IBKR ${amount}`,
			'\tAssets:HDFC',
			'',
		].join('\n');

	it('counts an event once, keeping its evidence', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: transfer('event', '1000') });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: transfer('same-as', '1000') });
			await Files.createFile({ ledger, key: 'a.rupee', content: groceries });

			expect(await issues(ledger)).toEqual(ok([]));
			expect((await listed(ledger)).map((t) => [t.location.file, t.counted])).toEqual([
				['ibkr.rupee', false],
				['hdfc.rupee', true],
				['a.rupee', true],
			]);
		}));

	it('reports a broken event on every sync and counts all of it', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: transfer('same-as', '1000') });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: transfer('same-as', '1000') });

			const problem = {
				type: 'EventWithoutPrimary',
				event: '2026-10-03-ibkr-otter',
				location: 'hdfc.rupee:1, ibkr.rupee:1',
			};
			expect(await issues(ledger)).toEqual(ok([problem]));
			expect(await issues(ledger)).toEqual(ok([problem]));
			expect((await listed(ledger)).every((t) => t.counted)).toBe(true);
		}));

	it('reports evidence that disagrees with its primary', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: transfer('event', '1000') });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: transfer('same-as', '999') });

			expect((await issues(ledger))._unsafeUnwrap()).toMatchObject([
				{ type: 'EventDisagreement', location: 'ibkr.rupee:1', account: 'Assets:IBKR' },
				{ type: 'EventDisagreement', location: 'ibkr.rupee:1', account: 'Assets:HDFC' },
			]);
		}));
});

describe('balance assertions', () => {
	const opening = '2026-08-01 Opening\n\tAssets:Bank 1000\n\tEquity:Opening\n';
	const statement = [
		'2026-08-02 TEA',
		'\tAssets:Bank -100 = 900',
		'\tExpenses:Food',
		'',
		'2026-08-02 BOOKS',
		'\tAssets:Bank -50 = 850',
		'\tExpenses:Books',
		'',
		'2026-08-03 REFUND',
		'\tAssets:Bank 200 = 1050',
		'\tIncome:Refunds',
		'',
	].join('\n');

	it('checks the running balance across days and files', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'opening.rupee', content: opening });
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: statement });

			expect(await issues(ledger)).toEqual(ok([]));
		}));

	it('reports an assertion that does not hold, on every sync', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'opening.rupee', content: opening });
			await Files.createFile({
				ledger,
				key: 'hdfc.rupee',
				content: statement.replace('= 850', '= 800'),
			});

			const problem = {
				type: 'BalanceAssertionFailed',
				location: 'hdfc.rupee:5',
				account: 'Assets:Bank',
				expected: '800.00',
				actual: '850.00',
			};
			expect(await issues(ledger)).toEqual(ok([problem]));
			expect(await issues(ledger)).toEqual(ok([problem]));
		}));

	it('orders another file by time, and warns when it cannot', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'opening.rupee', content: opening });
			await Files.createFile({ ledger, key: 'hdfc.rupee', content: statement });
			await Files.createFile({
				ledger,
				key: 'cash.rupee',
				content: '2026-08-02 ATM\n\tAssets:Bank -10\n\tAssets:Cash\n',
			});

			expect((await issues(ledger))._unsafeUnwrap()).toEqual([
				{
					type: 'BalanceAssertionAmbiguous',
					location: 'hdfc.rupee:1',
					account: 'Assets:Bank',
					unordered: 'cash.rupee:1',
				},
				expect.objectContaining({ type: 'BalanceAssertionAmbiguous', location: 'hdfc.rupee:5' }),
				expect.objectContaining({ type: 'BalanceAssertionFailed', location: 'hdfc.rupee:9' }),
			]);
		}));

	it('places an event at its primary', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'opening.rupee', content: opening });
			await Files.createFile({
				ledger,
				key: 'hdfc.rupee',
				content: statement
					.replace('2026-08-02 TEA', '2026-08-02 09:00 TEA')
					.replace('2026-08-02 BOOKS\n', '2026-08-02 10:05 BOOKS\n\t- same-as: books\n'),
			});
			await Files.createFile({
				ledger,
				key: 'amazon.rupee',
				content: [
					'2026-08-02 10:00 Amazon order',
					'\t- event: books',
					'\tAssets:Bank -50',
					'\tExpenses:Books 30',
					'\tExpenses:Stationery 20',
					'',
				].join('\n'),
			});

			expect(await issues(ledger)).toEqual(ok([]));
		}));

	it('checks each commodity of an account on its own', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const ibkr = (aapl: string) =>
				[
					'2026-10-01 Fund',
					'\tAssets:IBKR 1000 USD @ 83',
					'\tAssets:HDFC',
					'',
					'2026-10-02 Buy',
					`\tAssets:IBKR 2 AAPL @ 200 USD = ${aapl} AAPL`,
					'\tAssets:IBKR -400 USD = 600 USD',
					'',
				].join('\n');
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: ibkr('2') });
			expect(await issues(ledger)).toEqual(ok([]));

			await Files.deleteFiles({ ledger, keys: ['ibkr.rupee'] });
			await Files.createFile({ ledger, key: 'ibkr.rupee', content: ibkr('3') });
			expect(await issues(ledger)).toEqual(
				ok([
					{
						type: 'BalanceAssertionFailed',
						location: 'ibkr.rupee:5',
						account: 'Assets:IBKR',
						expected: '3.00 AAPL',
						actual: '2.00 AAPL',
					},
				]),
			);
		}));
});

describe('lots', () => {
	const bought = ['2024-01-02 Buy', '\tAssets:Zerodha 10 INFY @ 1500', '\tAssets:Bank', ''].join(
		'\n',
	);

	const sold = (posting: string) =>
		['2025-03-01 Sell', posting, '\tAssets:Bank 6800', '\tIncome:Gains', ''].join('\n');

	const held = (db: Database, ledgerId: string) =>
		db
			.select({ account: lots.account, remaining: lots.remaining, origin: lots.origin })
			.from(lots)
			.where(eq(lots.ledgerId, ledgerId))
			.orderBy(asc(lots.date), asc(lots.account));

	it('books lots across files, and what a sale takes from them', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: bought });
			await Files.createFile({
				ledger,
				key: 'b.rupee',
				content: sold('\tAssets:Zerodha -4 INFY {1500} @ 1700'),
			});

			expect(await issues(ledger)).toEqual(ok([]));
			expect(await held(db, ledger.id)).toEqual([
				{ account: 'Assets:Zerodha', remaining: 6_0000000000n, origin: 'buy' },
			]);
		}));

	it('books again when only the file with the buy changes', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: bought });
			await Files.createFile({
				ledger,
				key: 'b.rupee',
				content: sold('\tAssets:Zerodha -4 INFY {1500} @ 1700'),
			});

			const file = (await Files.readFile({ ledger, key: 'a.rupee' }))._unsafeUnwrap();
			await Files.editFile({
				ledger,
				key: 'a.rupee',
				content: bought.replace('@ 1500', '@ 1400'),
				version: file.version,
			});

			expect(await issues(ledger)).toEqual(
				ok([
					{
						type: 'LotNotOpen',
						location: 'b.rupee:1',
						account: 'Assets:Zerodha',
						units: '4.00 INFY',
					},
				]),
			);
		}));

	it('reports a sale that names no lot, and a named lot that went with its file', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupee', content: bought });
			await Files.createFile({
				ledger,
				key: 'b.rupee',
				content: sold('\tAssets:Zerodha -4 INFY @ 1700'),
			});
			await Files.createFile({
				ledger,
				key: 'c.rupee',
				content: sold('\tAssets:Zerodha -4 INFY {1500} @ 1700'),
			});
			expect((await issues(ledger))._unsafeUnwrap()).toEqual([
				{ type: 'LotCostMissing', location: 'b.rupee:1', account: 'Assets:Zerodha' },
			]);

			await Files.deleteFiles({ ledger, keys: ['a.rupee'] });
			expect((await issues(ledger))._unsafeUnwrap()).toEqual([
				{
					type: 'LotNotOpen',
					location: 'c.rupee:1',
					account: 'Assets:Zerodha',
					units: '4.00 INFY',
				},
			]);
		}));

	it('opens no lot for a buy that is evidence of another', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const buy = (role: string) =>
				bought.replace('Buy\n', `Buy\n\t- ${role}: 2024-01-02-infy-otter\n`);
			await Files.createFile({ ledger, key: 'a.rupee', content: buy('event') });
			await Files.createFile({ ledger, key: 'b.rupee', content: buy('same-as') });

			expect(await issues(ledger)).toEqual(ok([]));
			expect(await held(db, ledger.id)).toHaveLength(1);
		}));
});

describe('syncing past a failure', () => {
	it('reports a file it cannot read, and indexes the rest', ({ context, db, storage }) => {
		const gone = fault('UnknownError', { message: 'disk gone' });
		const unreadable = {
			...storage,
			read: (k: string) => (k.endsWith('a.rupee') ? errAsync(gone) : storage.read(k)),
		};
		const storages = { local: (u: string) => scoped(unreadable, `users/${u}`) };

		return provide({ ...context, storages }, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', groceries);
			await put(storage, ledger, 'b.rupee', salary);

			expect(await issues(ledger)).toEqual(
				ok([expect.objectContaining({ type: 'CannotReadFile', path: 'a.rupee', cause: [gone] })]),
			);
			expect(await summary(ledger.id)).toEqual(['b.rupee:1 Salary']);
		});
	});

	it('reports descriptions it cannot embed, and indexes them anyway', ({ context, db, storage }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			await put(storage, ledger, 'a.rupee', groceries);

			expect(await issues(ledger)).toEqual(
				ok([fault('UnknownError', { message: 'no such model' })]),
			);
			expect(await summary(ledger.id)).toEqual(['a.rupee:1 Groceries']);
		}));
});
