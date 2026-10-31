import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import * as DB from '#services/ledger/adapters/database.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import type { Amount } from '#services/ledger/domain/amounts.ts';
import { readSeries } from '#services/ledger/domain/series.ts';
import { Feed, PriceSource } from '#services/ledger/domain/types.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { sql } from 'kysely';
import { describe, expect } from 'vitest';

const UNIT = 10_000_000_000n;
const OLD = '2020-03-01 Salary\n\tAssets:Bank 1000\n\tIncome:Salary\n';

const worthOn = async (ledger: Ledger, d: string, account: string | null = null) => {
	const day = Temporal.PlainDate.from(d);
	const found = await Accounts.listWorth({ ledger, from: day, to: day, account });

	return found._unsafeUnwrap().succeeded[0]?.worth;
};

const blank = (db: Database, id: string) =>
	sql`update balance_years set balances = ''::bytea where ledger_id = ${id}`.execute(db);

describe('the check coming round', () => {
	it('reaches a first year that starts late and a last year that ends early', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2015-03-15 Salary\n\tAssets:Bank 100\n\tIncome:Salary\n',
				'2018-06-01 Salary\n\tAssets:Bank 10\n\tIncome:Salary\n',
				'2024-06-10 Salary\n\tAssets:Bank 1\n\tIncome:Salary\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });
			await blank(db, ledger.id);

			for (const n of Array.from({ length: 12 }, (_, i) => i))
				await Files.createFile({
					ledger,
					key: `tip-${n}.rupea`,
					content: '2024-03-01 Tip\n\tAssets:Cash 3\n\tIncome:Tips\n',
				});

			expect(await worthOn(ledger, '2015-04-01', 'Assets:Bank')).toBe(100n * UNIT);
			expect(await worthOn(ledger, '2018-07-01', 'Assets:Bank')).toBe(110n * UNIT);
			expect(await worthOn(ledger, '2024-07-01', 'Assets:Bank')).toBe(111n * UNIT);
		}));

	it('rewrites only the years it is given', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				OLD,
				'2021-03-01 Salary\n\tAssets:Bank 5\n\tIncome:Salary\n',
				'2022-03-01 Salary\n\tAssets:Bank 7\n\tIncome:Salary\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });
			await blank(db, ledger.id);

			await DB.saveBalanceYears(ledger.id, { from: 2021, to: 2021, holdings: null });

			const years = await db
				.selectFrom('balanceYears as y')
				.innerJoin('accounts as a', 'a.id', 'y.accountId')
				.select(['y.year', 'y.balances'])
				.where('y.ledgerId', '=', ledger.id)
				.where('a.name', '=', 'Assets:Bank')
				.orderBy('y.year')
				.execute();
			expect(years.map((y) => [y.year, y.balances.length > 0])).toEqual([
				[2020, false],
				[2021, true],
				[2022, false],
			]);
		}));
});

describe('price years of a shared symbol', () => {
	const held = [
		'2020-01-01 Buy',
		'\tAssets:Demat 2 INFY @ 100',
		'\tAssets:Bank',
		'',
		'P * INFY yahoo:INFY.NS',
		'',
	].join('\n');
	const quote = (date: string, price: bigint) => ({
		date: Temporal.PlainDate.from(date),
		price: { amount: (price * UNIT) as Amount, commodity: 'INR' },
	});
	const yahoo = (db: Database) =>
		db
			.selectFrom('symbols')
			.select('id')
			.where('feed', '=', Feed.Yahoo)
			.where('symbol', '=', 'INFY.NS')
			.executeTakeFirstOrThrow();

	it('are all built when a quote arrives before the ledger’s first sync', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: held });
			const symbol = await yahoo(db);
			await DB.saveQuotes(symbol.id, PriceSource.Yahoo, [
				quote('2020-06-01', 200n),
				quote('2024-06-01', 300n),
			]);
			await db.deleteFrom('priceYears').where('symbolId', '=', symbol.id).execute();

			await DB.saveQuotes(symbol.id, PriceSource.Yahoo, [quote('2026-06-01', 400n)]);
			await Sync.syncIndex(ledger);

			const years = await db
				.selectFrom('priceYears')
				.select('year')
				.where('symbolId', '=', symbol.id)
				.orderBy('year')
				.execute();
			expect(years.map((y) => y.year)).toEqual([2020, 2024, 2026]);
		}));

	it('keep every quote saved at once', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: held });
			const symbol = await yahoo(db);

			const saved = await Promise.all(
				Array.from({ length: 8 }, (_, i) =>
					DB.saveQuotes(symbol.id, PriceSource.Yahoo, [
						quote(`2024-01-0${i + 1}`, 100n + BigInt(i)),
					]),
				),
			);

			expect(saved.filter((s) => s.isErr())).toEqual([]);
			const row = await db
				.selectFrom('priceYears')
				.select('amounts')
				.where('symbolId', '=', symbol.id)
				.where('year', '=', 2024)
				.executeTakeFirstOrThrow();
			expect(readSeries(row.amounts).slice(0, 8)).toEqual(
				Array.from({ length: 8 }, (_, i) => (100n + BigInt(i)) * UNIT),
			);
		}));

	it('rebuild for several ledgers at once without failing any', ({ context, db }) =>
		provide(context, async () => {
			const ledgers = await Promise.all(Array.from({ length: 6 }, () => createLedger(db)));
			for (const ledger of ledgers)
				await Files.createFile({ ledger, key: 'a.rupea', content: held });
			const symbol = await yahoo(db);
			await DB.saveQuotes(symbol.id, PriceSource.Yahoo, [quote('2024-06-01', 300n)]);

			const rebuilt = await Promise.all(ledgers.map((l) => DB.saveEveryYear(l.id)));

			expect(rebuilt.filter((r) => r.isErr())).toEqual([]);
		}));
});

describe('prices through a file', () => {
	it('drop a price edited out of its file', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const held = '2024-01-01 Buy\n\tAssets:Demat 2 INFY @ 100\n\tAssets:Bank\n';
			const content = `${held}\nP 2024-06-01 INFY 300\n`;
			const created = await Files.createFile({ ledger, key: 'a.rupea', content });
			const priced = await worthOn(ledger, '2024-07-01');

			await Files.editFile({
				ledger,
				key: 'a.rupea',
				content: held,
				version: created._unsafeUnwrap().version,
			});

			expect(priced).toBe(400n * UNIT);
			expect(await worthOn(ledger, '2024-07-01')).toBe(0n);
		}));

	it('value through a second price quoted years before the span', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2020-01-01 Buy',
				'\tAssets:Broker 3 AAPL',
				'\tEquity:Opening',
				'',
				'P 2020-01-02 AAPL 200 USD',
				'P 2020-01-03 USD 80',
				'P 2020-01-04 UNUSED 9',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			expect(await worthOn(ledger, '2025-01-01', 'Assets')).toBe(48000n * UNIT);
		}));
});

describe('a full reindex, of what reading alone cannot repair', () => {
	const asserted = [
		'2020-03-01 Salary\n\tAssets:Bank 1000\n\tIncome:Salary\n',
		'2021-03-01 Check\n\tAssets:Bank 0 = 1000\n\tIncome:Salary 0\n',
	].join('\n');

	it('works out balance checks again from months put right', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: asserted });
			await sql`update monthly_deltas set amount = 1 where ledger_id = ${ledger.id} and month = '2020-03-01'`.execute(
				db,
			);
			await DB.saveBalanceChecks(ledger.id, {
				from: Temporal.PlainDate.from('2021-01-01'),
				holdings: null,
			});
			const doubted = (await Sync.listProblems(ledger))._unsafeUnwrap().failed;

			await Sync.resyncLedger(ledger);

			expect(doubted.map((f) => f.type)).toContain('BalanceAssertionFailed');
			expect((await Sync.listProblems(ledger))._unsafeUnwrap().failed).toEqual([]);
		}));

	it('books lots again', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = '2024-01-01 Buy\n\tAssets:Demat 2 INFY @ 100\n\tAssets:Bank\n';
			await Files.createFile({ ledger, key: 'a.rupea', content });
			await db.deleteFrom('lots').where('ledgerId', '=', ledger.id).execute();

			await Sync.resyncLedger(ledger);

			const lots = await Accounts.listLots({ ledger, account: 'Assets:Demat', commodity: 'INFY' });
			expect(lots._unsafeUnwrap().succeeded).toHaveLength(1);
		}));

	it('builds what a ledger indexed before these tables lacks', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: OLD });
			await db.deleteFrom('balanceYears').where('ledgerId', '=', ledger.id).execute();

			await Sync.resyncLedger(ledger);

			expect(await worthOn(ledger, '2025-01-01')).toBe(1000n * UNIT);
		}));
});
