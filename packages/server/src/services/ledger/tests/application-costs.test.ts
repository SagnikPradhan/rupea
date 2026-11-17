import { provide } from '#lib/server/shared/context/context.ts';
import * as Deltas from '#services/ledger/application/deltas.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { EVERYTHING, type Filter } from '#services/ledger/domain/filters.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import type { Bucket } from '@rupea/shared/balances.ts';
import { sql } from 'kysely';
import { readFile } from 'node:fs/promises';
import { describe, expect } from 'vitest';
import { costDriftOf, costsOf } from './fixtures/deltas';

const TRADES = [
	'P 2026-01-02 USD 80',
	'P 2026-03-01 USD 90',
	'P 2026-03-01 AAPL 110 USD',
	'P 2026-10-01 INFY 1800',
	'',
	'2026-01-02 Buy',
	'\tAssets:Zerodha 10 INFY @ 1500',
	'\tAssets:Bank',
	'',
	'2026-01-02 Buy',
	'\tAssets:IBKR 2 AAPL @ 100 USD',
	'\tAssets:IBKR 1 MSFT @@ 300 USD',
	'\tAssets:IBKR -500 USD',
	'',
	'2026-02-01 Buy',
	'\tAssets:IBKR 3 AAPL @ 100 USD',
	'\tAssets:IBKR -300 USD',
	'',
	'2026-03-01 Sell',
	'\tAssets:Zerodha -4 INFY {1500} @ 1700',
	'\tAssets:Bank 6800',
	'\tIncome:Gains -800',
	'',
	'2026-03-01 Buy',
	'\tAssets:Zerodha 2 INFY @ 1600',
	'\tAssets:Bank',
	'',
	'2026-03-01 Sell',
	'\tAssets:Zerodha -1 INFY {1500} @ 1650',
	'\tAssets:Bank 1650',
	'\tIncome:Gains -150',
	'',
	'2026-03-01 Sell',
	'\tAssets:IBKR -1 AAPL {100 USD} @ 110 USD',
	'\tAssets:IBKR 110 USD',
	'\tIncome:Gains -10 USD',
	'',
	'2026-04-01 Card',
	'\tLiabilities:Card -200',
	'\tExpenses:Food 200',
	'',
	'2026-10-01 Buy',
	'\tAssets:Zerodha 1 INFY @ 1900',
	'\tAssets:Bank',
	'',
].join('\n');

const SPAN = {
	from: Temporal.PlainDate.from('2026-01-01'),
	to: Temporal.PlainDate.from('2026-12-31'),
};

const NOT_EVERYTHING: Filter = { kind: 'all', of: [EVERYTHING] };

const readAt = async (ledger: Ledger, bucket: Bucket, filter: Filter) => {
	const read = await Deltas.listDeltas({
		ledger,
		...SPAN,
		bucket,
		filter,
		valued: 'cost',
		measures: ['value', 'inflow', 'outflow'],
	});

	return read._unsafeUnwrap().succeeded[0]?.rows ?? [];
};

describe('daily costs', () => {
	it.for(['date', 'month', 'year'] as const)(
		'give the same %s deltas at cost as the postings do',
		(bucket, { context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				await Files.createFile({ ledger, key: 'a.rupea', content: TRADES });

				const stored = await readAt(ledger, bucket, EVERYTHING);
				const posted = await readAt(ledger, bucket, NOT_EVERYTHING);

				expect(stored.length).toBeGreaterThan(5);
				expect(stored.some((r) => r.account.startsWith('Expenses'))).toBe(true);
				expect(stored.some((r) => r.unpriced > 0)).toBe(false);
				expect(stored).toEqual(posted);
				expect(await costDriftOf(db, ledger.id)).toEqual([]);
			}),
	);

	it('are what a read of every posting uses, and a read with a filter is not', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: TRADES });
			const before = await readAt(ledger, 'year', NOT_EVERYTHING);
			await sql`update daily_costs set cost = cost + 1, inflow = inflow + 1 where ledger_id = ${ledger.id}`.execute(
				db,
			);

			expect(await readAt(ledger, 'year', NOT_EVERYTHING)).toEqual(before);
			expect(await readAt(ledger, 'year', EVERYTHING)).not.toEqual(before);
		}));

	it('keep the unpriced count of a commodity with no rate', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = '2026-02-01 Move\n\tAssets:Demat 3 XYZ\n\tAssets:Other -3 XYZ\n';
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const stored = await readAt(ledger, 'date', EVERYTHING);

			expect(stored.some((r) => r.unpriced === 1)).toBe(true);
			expect(stored).toEqual(await readAt(ledger, 'date', NOT_EVERYTHING));
		}));

	it('hold only the counted postings of asset and liability accounts', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: TRADES });

			const rows = await costsOf(db, ledger.id);

			expect(rows.some((r) => r.startsWith('Liabilities:Card INR INR 2026-04-01 -200 1'))).toBe(
				true,
			);
			expect(rows.some((r) => r.startsWith('Expenses') || r.startsWith('Income'))).toBe(false);
			expect(rows).toContain('Assets:IBKR MSFT USD 2026-01-02 300 1');
			expect(rows).toContain('Assets:Zerodha INFY INR 2026-03-01 -5250 3');
		}));
});

describe('daily costs through edits', () => {
	const MORE = '2026-05-01 Buy\n\tAssets:Zerodha 2 INFY @ 1700\n\tAssets:Bank\n';
	const LESS = TRADES.replace(
		'2026-10-01 Buy\n\tAssets:Zerodha 1 INFY @ 1900\n\tAssets:Bank\n',
		'',
	);

	const built = async (db: Parameters<typeof createLedger>[0], files: Record<string, string>) => {
		const ledger = await createLedger(db);
		for (const [key, content] of Object.entries(files))
			await Files.createFile({ ledger, key, content });

		return costsOf(db, ledger.id);
	};

	it('match a fresh build after a file is edited, deleted and read again', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const first = await Files.createFile({ ledger, key: 'a.rupea', content: TRADES });
			await Files.createFile({ ledger, key: 'b.rupea', content: MORE });
			expect(await costDriftOf(db, ledger.id)).toEqual([]);

			await Files.editFile({
				ledger,
				key: 'a.rupea',
				content: LESS,
				version: first._unsafeUnwrap().version,
			});
			expect(await costDriftOf(db, ledger.id)).toEqual([]);
			expect(await costsOf(db, ledger.id)).toEqual(
				await built(db, { 'a.rupea': LESS, 'b.rupea': MORE }),
			);

			await Files.deleteFiles({ ledger, keys: ['b.rupea'] });
			expect(await costDriftOf(db, ledger.id)).toEqual([]);
			expect(await costsOf(db, ledger.id)).toEqual(await built(db, { 'a.rupea': LESS }));

			await Files.createFile({ ledger, key: 'b.rupea', content: MORE });
			expect(await costDriftOf(db, ledger.id)).toEqual([]);
			expect(await costsOf(db, ledger.id)).toEqual(
				await built(db, { 'a.rupea': LESS, 'b.rupea': MORE }),
			);
		}));

	const errors = [
		{
			name: 'a wrong cost',
			introduce: (id: string) =>
				sql`update daily_costs set cost = cost + 1, inflow = inflow + 1 where ledger_id = ${id}`,
		},
		{
			name: 'a missing day',
			introduce: (id: string) =>
				sql`delete from daily_costs where ledger_id = ${id} and date = '2026-03-01'`,
		},
		{
			name: 'stray days',
			introduce: (id: string) =>
				sql`insert into daily_costs (ledger_id, account_id, commodity, cost_commodity, date, cost, inflow, outflow, postings)
					select ${id}, a.id, 'INR', 'INR', d, 1, 1, 0, 1
					from accounts a, unnest('{2001-01-01,2030-01-01}'::date[]) d
					where a.ledger_id = ${id} and a.name = 'Assets:Bank'`,
		},
		{
			name: 'every day dropped',
			introduce: (id: string) => sql`delete from daily_costs where ledger_id = ${id}`,
		},
		{
			name: 'a posting changed without a settle',
			introduce: (id: string) =>
				sql`update postings set amount = amount * 2 where ledger_id = ${id} and commodity = 'INR' and amount < 0`,
		},
	];

	it.for(errors)('put right $name on the next settle', ({ introduce }, { context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: TRADES });
			await introduce(ledger.id).execute(db);
			expect(await costDriftOf(db, ledger.id)).not.toEqual([]);

			await Files.createFile({ ledger, key: 'b.rupea', content: MORE });

			expect(await costDriftOf(db, ledger.id)).toEqual([]);
		}),
	);
});

describe('the migration that adds daily costs', () => {
	it('fills the table from the postings of ledgers that already have them', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content: TRADES });
			const built = await costsOf(db, ledger.id);
			const migration = await readFile(
				new URL('../../../../drizzle/0017_daily_costs.sql', import.meta.url),
				'utf8',
			);
			const backfill = migration
				.split('--> statement-breakpoint')
				.find((s) => s.trim().startsWith('INSERT INTO "daily_costs"'));
			await sql`delete from daily_costs`.execute(db);
			expect(await costsOf(db, ledger.id)).toEqual([]);

			await sql.raw(backfill ?? '').execute(db);

			expect(built.length).toBeGreaterThan(5);
			expect(await costsOf(db, ledger.id)).toEqual(built);
			expect(await costDriftOf(db, ledger.id)).toEqual([]);
		}));
});
