import type { Database } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import * as DB from '#services/ledger/adapters/database.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import type { Amount } from '#services/ledger/domain/amounts.ts';
import { NO_AMOUNT, readSeries } from '#services/ledger/domain/series.ts';
import { Feed, PriceSource } from '#services/ledger/domain/types.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { sql } from 'kysely';
import { describe, expect } from 'vitest';

const OLD = '2020-03-01 Salary\n\tAssets:Bank 1000\n\tIncome:Salary\n';
const NEW = '2024-03-01 Salary\n\tAssets:Bank 500\n\tIncome:Salary\n';
const UNIT = 10_000_000_000n;

const worthOn = async (ledger: Ledger, d: string) => {
	const day = Temporal.PlainDate.from(d);
	const found = await Accounts.listWorth({ ledger, from: day, to: day, account: null });

	return found._unsafeUnwrap().succeeded[0]?.worth;
};

const priceYearsOf = (db: Database, year: number) =>
	db.selectFrom('priceYears').select(['symbolId', 'amounts']).where('year', '=', year).execute();

describe('balance years', () => {
	it('rewrite every later balance when an old day changes', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: `${OLD}\n${NEW}` });
			expect(await worthOn(ledger, '2025-01-01')).toBe(1500n * UNIT);

			const older = '2020-02-01 Gift\n\tAssets:Bank 7\n\tIncome:Gift\n';
			await Files.createFile({ ledger, key: 'b.rupea', content: older });

			expect(await worthOn(ledger, '2020-02-01')).toBe(7n * UNIT);
			expect(await worthOn(ledger, '2022-01-01')).toBe(1007n * UNIT);
			expect(await worthOn(ledger, '2025-01-01')).toBe(1507n * UNIT);
		}));

	it('go when the file holding them does', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: OLD });
			await Files.createFile({ ledger, key: 'b.rupea', content: NEW });

			await Files.deleteFiles({ ledger, keys: ['a.rupea'] });

			expect(await worthOn(ledger, '2025-01-01')).toBe(500n * UNIT);
		}));

	it('show nothing until a sync builds what a ledger lacks, even with no change', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: OLD });
			await db.deleteFrom('balanceYears').where('ledgerId', '=', ledger.id).execute();
			const empty = await worthOn(ledger, '2025-01-01');

			await Sync.syncIndex(ledger);

			expect(empty).toBeUndefined();
			expect(await worthOn(ledger, '2025-01-01')).toBe(1000n * UNIT);
		}));

	it('are put right as the check comes round to a year left wrong', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: OLD });
			await sql`update balance_years set balances = ''::bytea where ledger_id = ${ledger.id}`.execute(
				db,
			);
			await sql`update ledgers set checked_through = '2019-12-01' where id = ${ledger.id}`.execute(
				db,
			);

			const elsewhere = '2024-03-01 Tip\n\tAssets:Cash 3\n\tIncome:Tips\n';
			await Files.createFile({ ledger, key: 'b.rupea', content: elsewhere });

			expect(await worthOn(ledger, '2020-06-01')).toBe(1000n * UNIT);
		}));
});

describe('price years', () => {
	const held = '2024-01-01 Buy\n\tAssets:Demat 2 INFY @ 100\n\tAssets:Bank\n';

	it('hold each day’s winner, a P line over an at-price', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = `${held}\nP 2024-01-01 INFY 150\n`;
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const [row] = await priceYearsOf(db, 2024);
			const series = readSeries(row?.amounts ?? Buffer.alloc(0));

			expect(series[0]).toBe(150n * UNIT);
			expect(series[1]).toBe(NO_AMOUNT);
		}));

	it('follow a price line’s file when it goes', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: held });
			await Files.createFile({ ledger, key: 'p.rupea', content: 'P 2024-06-01 INFY 300\n' });
			const priced = await worthOn(ledger, '2024-07-01');

			await Files.deleteFiles({ ledger, keys: ['p.rupea'] });

			expect(priced).toBe(600n * UNIT - 200n * UNIT);
			expect(await worthOn(ledger, '2024-07-01')).toBe(0n);
		}));

	it('take a feed’s quotes as they are saved', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = `${held}\nP * INFY yahoo:INFY.NS\n`;
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const symbol = await db
				.selectFrom('symbols')
				.select('id')
				.where('feed', '=', Feed.Yahoo)
				.where('symbol', '=', 'INFY.NS')
				.executeTakeFirstOrThrow();

			const quote = { amount: (250n * UNIT) as Amount, commodity: 'INR' };
			const date = Temporal.PlainDate.from('2024-05-01');
			await DB.saveQuotes(symbol.id, PriceSource.Yahoo, [{ date, price: quote }]);

			expect(await worthOn(ledger, '2024-06-01')).toBe(500n * UNIT - 200n * UNIT);
		}));

	it('value a day as holdings do, through a second price', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2024-01-01 Buy',
				'\tAssets:Broker 3 AAPL',
				'\tEquity:Opening',
				'',
				'P 2024-01-02 AAPL 200 USD',
				'P 2024-01-03 USD 83.5',
				'P 2024-02-01 AAPL 210 USD',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const on = '2024-03-01';
			const day = Temporal.PlainDate.from(on);
			const accounts = (await Accounts.listAccounts({ ledger, day }))._unsafeUnwrap().succeeded;
			const held = accounts.find((a) => a.account === 'Assets:Broker')?.total;

			expect(held).toBeDefined();
			expect(await worthOn(ledger, on)).toBe(held);
		}));
});

describe('a full reindex', () => {
	it('rebuilds years left wrong and reads every file again', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: OLD });
			await sql`update balance_years set balances = ''::bytea where ledger_id = ${ledger.id}`.execute(
				db,
			);
			await sql`update monthly_deltas set amount = 1 where ledger_id = ${ledger.id}`.execute(db);
			await sql`update postings set amount = amount * 2 where ledger_id = ${ledger.id}`.execute(db);

			await Sync.resyncLedger(ledger);

			expect(await worthOn(ledger, '2025-01-01')).toBe(1000n * UNIT);
		}));
});
