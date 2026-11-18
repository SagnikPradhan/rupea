import type { Database } from '#lib/server/db/index.ts';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import * as Deltas from '#services/ledger/application/deltas.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import type { Balances } from '#services/ledger/domain/deltas.ts';
import type { Filter } from '#services/ledger/domain/filters.ts';
import { BEGINNING } from '@rupea/shared/dates.ts';
import type { Aggregate, Bucket, Measure } from '@rupea/shared/balances.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect } from 'vitest';

describe('deltas', () => {
	const from = Temporal.PlainDate.from('2026-10-01');
	const to = Temporal.PlainDate.from('2026-10-03');

	it('fails for an account nothing matches, in any case, but not for a root', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2026-10-02 Fund\n\tAssets:Bank 5\n\tIncome:Gift\n',
			});
			const read = (account: string) =>
				Deltas.listDeltas({ ledger, from, to, bucket: 'date', accounts: [account] });

			expect((await read('Assets:Nope'))._unsafeUnwrapErr()).toEqual({
				type: 'AccountNotFound',
				account: 'Assets:Nope',
			});
			expect((await read('assets:BANK')).isOk()).toBe(true);
			expect((await read('EXPENSES'))._unsafeUnwrap().succeeded[0]?.rows).toEqual([]);
		}));

	it('refuses a date bucket over 1827 days, and allows exactly 1827 days', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2020-01-01 Fund\n\tAssets:Bank 5\n\tIncome:Gift\n',
			});
			const refusal = (start: string, bucket: Bucket, account?: string) =>
				Deltas.listDeltas({
					ledger,
					from: Temporal.PlainDate.from(start),
					to: Temporal.PlainDate.from('2025-01-02'),
					accounts: account === undefined ? undefined : [account],
					bucket,
					most: bucket === 'date' ? 1827 : undefined,
				});

			expect((await refusal('2020-01-01', 'date'))._unsafeUnwrapErr()).toEqual({
				type: 'SpanTooLong',
				days: 1828,
				most: 1827,
			});
			expect((await refusal(BEGINNING, 'date'))._unsafeUnwrapErr()).toEqual({
				type: 'SpanTooLong',
				days: 1828,
				most: 1827,
			});
			expect((await refusal('2020-01-02', 'date')).isOk()).toBe(true);
			expect((await refusal(BEGINNING, 'date', 'Expenses')).isOk()).toBe(true);
			expect((await refusal(BEGINNING, 'month')).isOk()).toBe(true);
			expect((await refusal('2020-01-01', 'year')).isOk()).toBe(true);
		}));
});

describe('spending', () => {
	const span = (from: string, to: string) => ({
		from: Temporal.PlainDate.from(from),
		to: Temporal.PlainDate.from(to),
	});
	const content = [
		'2026-01-10 Groceries',
		'\tExpenses:Food:Groceries 1000',
		'\tAssets:Bank',
		'',
		'2026-01-20 Refund',
		'\tExpenses:Food:Groceries -200',
		'\tAssets:Bank',
		'',
		'2026-02-05 Hotel',
		'\tExpenses:Travel 100 USD',
		'\tLiabilities:Card',
		'',
		'2026-02-06 Souvenir',
		'\tExpenses:Travel 5 EUR',
		'\tExpenses:Travel 3 EUR',
		'\tLiabilities:Card',
		'',
		'P 2026-02-01 USD 83',
		'P 2026-03-01 USD 90',
		'',
	].join('\n');
	const listed = async (
		ledger: Ledger,
		{
			from,
			to,
			account,
			...rest
		}: { from: string; to: string; account?: string; bucket?: Bucket; measures?: Measure[] },
		aggregate: Aggregate = 'sum',
	) => {
		const [deltas] = (
			await Deltas.listDeltas({
				ledger,
				...span(from, to),
				bucket: 'month',
				aggregate,
				accounts: account === undefined ? undefined : [account],
				...rest,
			})
		)._unsafeUnwrap().succeeded;

		return deltas;
	};
	const buckets = (spending: Balances | undefined) =>
		spending?.rows.map((r) => [r.account, r.bucket, r.value, r.unpriced]);
	const totals = (spending: Balances | undefined) =>
		Object.entries(Object.groupBy(spending?.rows ?? [], (r) => r.account)).map(
			([account, rows]) => [
				account,
				rows?.reduce((n, r) => n + (r.value ?? 0n), 0n),
				rows?.reduce((n, r) => n + r.unpriced, 0),
			],
		);

	it('adds up Income as it adds up Expenses, as the negative amounts it is credited', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const pay = ['2026-01-05 Pay', '\tIncome:Salary -5000', '\tAssets:Bank', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: `${content}\n${pay}` });

			const year = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-12-31',
				account: 'Income',
			});
			expect(totals(year)).toEqual([
				['Income', -5000_0000000000n, 0],
				['Income:Salary', -5000_0000000000n, 0],
			]);
		}));

	it('adds up what came in and what went out of an account, which the net hides', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const flows = [
				'P 2026-01-01 USD 83',
				'',
				'2026-01-02 Spend',
				'\tExpenses:Food 500',
				'\tLiabilities:Card',
				'',
				'2026-01-20 Pay',
				'\tLiabilities:Card 500',
				'\tAssets:Bank',
				'',
				'2026-02-03 Spend in dollars',
				'\tExpenses:Food 10 USD',
				'\tLiabilities:Card',
				'',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: flows });

			const card = async (from: string, to: string) => {
				const spending = await listed(ledger, {
					from,
					to,
					account: 'Liabilities',
					measures: ['value', 'inflow', 'outflow'],
				});
				const rows = spending?.rows.filter((r) => r.account === 'Liabilities:Card') ?? [];
				const added = (k: 'value' | 'inflow' | 'outflow') =>
					rows.reduce((n, r) => n + (r[k] ?? 0n), 0n);

				return [added('value'), added('inflow'), added('outflow')];
			};

			expect(await card('2026-01-01', '2026-01-31')).toEqual([
				0n,
				500_0000000000n,
				500_0000000000n,
			]);
			expect(await card('2026-01-01', '2026-02-28')).toEqual([
				-830_0000000000n,
				500_0000000000n,
				1330_0000000000n,
			]);
			expect(await card('2026-01-10', '2026-01-25')).toEqual([
				500_0000000000n,
				500_0000000000n,
				0n,
			]);
		}));

	it('adds up only the days a span covers of the months at its edges, and the whole months between', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const more = ['2026-03-15 Fuel', '\tExpenses:Fuel 70', '\tAssets:Bank', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: `${content}\n${more}` });

			const food = (from: string, to: string) =>
				listed(ledger, { from, to, account: 'Expenses:Food' });
			const sums = (s: Balances | undefined) =>
				totals(s).map(([account, amount]) => [account, amount]);
			expect(sums(await food('2026-01-11', '2026-01-31'))).toEqual([
				['Expenses', -200_0000000000n],
				['Expenses:Food:Groceries', -200_0000000000n],
			]);
			expect(sums(await food('2026-01-01', '2026-01-19'))).toEqual([
				['Expenses', 1000_0000000000n],
				['Expenses:Food:Groceries', 1000_0000000000n],
			]);
			expect(sums(await food('2026-01-15', '2026-03-14'))).toEqual([
				['Expenses', -200_0000000000n],
				['Expenses:Food:Groceries', -200_0000000000n],
			]);
		}));

	it('adds up each account and its parents by bucket, leaving out one in between, net of refunds, at its own day’s price, counting each unpriced amount', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const year = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-12-31',
				account: 'Expenses',
			});
			expect(buckets(year)).toEqual([
				['Expenses', '2026-01', 800_0000000000n, 0],
				['Expenses', '2026-02', 8300_0000000000n, 2],
				['Expenses:Food:Groceries', '2026-01', 800_0000000000n, 0],
				['Expenses:Travel', '2026-02', 8300_0000000000n, 2],
			]);
			expect(totals(year)).toEqual([
				['Expenses', 9100_0000000000n, 2],
				['Expenses:Food:Groceries', 800_0000000000n, 0],
				['Expenses:Travel', 8300_0000000000n, 2],
			]);
		}));

	it('averages spending on each day of the month over the months of the span that have it', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-31 Rent\n\tExpenses:Rent 300\n\tAssets:Bank\n',
				'2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-03-05 Lunch\n\tExpenses:Food 200\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const days = await listed(
				ledger,
				{ from: '2026-01-01', to: '2026-03-31', account: 'Expenses', bucket: 'day' },
				'average',
			);
			expect(
				days?.rows.filter((r) => r.account === 'Expenses').map((r) => [r.bucket, r.value]),
			).toEqual([
				['5', 100_0000000000n],
				['31', 150_0000000000n],
			]);
		}));

	it('keeps the sum of a day of the month when asked to sum', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-03-05 Lunch\n\tExpenses:Food 200\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const days = await listed(ledger, {
				from: '2026-02-01',
				to: '2026-03-31',
				account: 'Expenses',
				bucket: 'day',
			});
			expect(buckets(days)?.filter(([a]) => a === 'Expenses')).toEqual([
				['Expenses', '5', 300_0000000000n, 0],
			]);
		}));

	it('buckets by calendar date, and covers every account when none is named', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-03-05 Lunch\n\tExpenses:Food 200\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const dates = await listed(ledger, { from: '2026-02-01', to: '2026-03-31', bucket: 'date' });

			expect(buckets(dates)?.filter(([a]) => a === 'Expenses')).toEqual([
				['Expenses', '2026-02-05', 100_0000000000n, 0],
				['Expenses', '2026-03-05', 200_0000000000n, 0],
			]);
			expect(dates?.rows.map((r) => r.account)).toContain('Assets:Bank');
			expect(dates?.base).toBe('INR');
		}));

	it('carries only the measures asked for', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2026-02-05 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
			});

			const spending = await listed(ledger, {
				from: '2026-02-01',
				to: '2026-02-28',
				account: 'Expenses',
				measures: ['inflow'],
			});

			expect(spending?.rows[0]).toEqual({
				account: 'Expenses',
				commodity: null,
				bucket: '2026-02',
				unpriced: 0,
				inflow: 100_0000000000n,
			});
		}));

	it('narrows to an account and those under it, ignoring case', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-12-31',
				account: 'expenses:food',
			});
			expect(totals(spending)).toEqual([
				['Expenses', 800_0000000000n, 0],
				['Expenses:Food:Groceries', 800_0000000000n, 0],
			]);
		}));

	it('adds up an account written in two cases as one', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = [
				'2026-01-02 Lunch\n\tExpenses:Food 100\n\tAssets:Bank\n',
				'2026-01-03 Dinner\n\tExpenses:food 50\n\tAssets:Bank\n',
			].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const spending = await listed(ledger, {
				from: '2026-01-01',
				to: '2026-01-31',
				account: 'Expenses',
			});
			expect(totals(spending)).toEqual([
				['Expenses', 150_0000000000n, 0],
				['Expenses:Food', 150_0000000000n, 0],
			]);
		}));

	it('reads a span by day or by year', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const by = (from: string, to: string, bucket: Bucket) =>
				listed(ledger, { from, to, account: 'Expenses', bucket });
			const later = await by('2026-01-15', '2026-01-31', 'day');
			const earlier = await by('2026-01-01', '2026-01-14', 'day');
			const year = await by('0001-01-01', '2026-12-31', 'year');
			expect(buckets(later)?.[0]).toEqual(['Expenses', '20', -200_0000000000n, 0]);
			expect(buckets(earlier)?.[0]).toEqual(['Expenses', '10', 1000_0000000000n, 0]);
			expect(buckets(year)?.[0]).toEqual(['Expenses', '2026', 9100_0000000000n, 2]);
		}));

	it('starts all of history on the first day spent', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const range = await listed(ledger, {
				from: '2025-11-15',
				to: '2026-01-31',
				account: 'Expenses',
			});
			const all = await listed(ledger, {
				from: '0001-01-01',
				to: '2026-12-31',
				account: 'Expenses',
			});
			expect(range?.from.toString()).toBe('2025-11-15');
			expect(all?.from.toString()).toBe('2026-01-10');
		}));

	it('refuses a span that runs backwards', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const reply = await Deltas.listDeltas({
				ledger,
				...span('2026-02-01', '2026-01-01'),
				accounts: ['Expenses'],
				bucket: 'month',
				aggregate: 'sum',
			});
			expect(reply._unsafeUnwrapErr()).toMatchObject({ type: 'SpanReversed' });
		}));

	it('counts a group once', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const dinner = (role: string) => [
				'2026-10-02 Dinner',
				`\t- ${role}: dinner`,
				'\tExpenses:Food 500',
				'\tAssets:Bank',
				'',
			];
			await Files.createFile({ ledger, key: 'a.rupea', content: dinner('group').join('\n') });
			await Files.createFile({ ledger, key: 'b.rupea', content: dinner('same-as').join('\n') });

			const spending = await listed(ledger, {
				from: '2026-10-01',
				to: '2026-10-31',
				account: 'Expenses',
			});
			expect(totals(spending)).toEqual([
				['Expenses', 500_0000000000n, 0],
				['Expenses:Food', 500_0000000000n, 0],
			]);
		}));
});

describe('deltas filtered by the other side', () => {
	const content = [
		'P 2026-10-01 USD 80',
		'',
		'2026-10-01 Salary',
		'\tAssets:Bank 1000',
		'\tIncome:Salary',
		'',
		'2026-10-02 Save',
		'\tAssets:Savings 400',
		'\tAssets:Bank',
		'',
		'2026-10-03 Lunch',
		'\tExpenses:Food 100',
		'\tAssets:Bank',
		'',
		'2026-10-04 Interest',
		'\tAssets:Savings 10',
		'\tIncome:Interest',
		'',
		'2026-10-05 Gift',
		'\tAssets:Wallet 10 USD',
		'\tIncome:Gift -10 USD',
		'',
		'2026-10-06 Change',
		'\tAssets:Wallet 5 USD @ 80 INR',
		'\tAssets:Bank -400',
		'',
	].join('\n');
	const account = (name: string) => ({ kind: 'account', name }) as const;
	const against = (name: string): Filter => ({ kind: 'counter', test: account(name) });
	const notAssets: Filter = { kind: 'counter', test: { kind: 'not', of: account('Assets') } };

	type Gained = { context: RupeaContext; db: Database; filter?: Filter; bucket?: Bucket };

	const gained = ({ context, db, filter, bucket = 'month' }: Gained) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const [balances] = (
				await Deltas.listDeltas({
					ledger,
					from: Temporal.PlainDate.from('2026-10-01'),
					to: Temporal.PlainDate.from('2026-10-31'),
					accounts: ['Assets'],
					...(filter && { filter }),
					bucket,
				})
			)._unsafeUnwrap().succeeded;

			return Object.fromEntries(
				balances?.rows
					.filter((r) => r.account.includes(':'))
					.map((r) => [`${r.account} ${r.bucket}`, Number(r.value) / 1e10]) ?? [],
			);
		});

	it('counts what came from Income and leaves a transfer between assets out', async ({
		context,
		db,
	}) => {
		const read = await gained({ context, db, filter: against('Income') });

		expect(read).toEqual({
			'Assets:Bank 2026-10': 1000,
			'Assets:Savings 2026-10': 10,
			'Assets:Wallet 2026-10': 800,
		});
	});

	it('counts what went to Expenses', async ({ context, db }) => {
		const read = await gained({ context, db, filter: against('Expenses') });

		expect(read).toEqual({ 'Assets:Bank 2026-10': -100 });
	});

	it('counts what is not another asset, which is the flow in or out of Assets', async ({
		context,
		db,
	}) => {
		const read = await gained({ context, db, filter: notAssets });

		expect(read).toEqual({
			'Assets:Bank 2026-10': 900,
			'Assets:Savings 2026-10': 10,
			'Assets:Wallet 2026-10': 800,
		});
	});

	it('reads the same by date as by month', async ({ context, db }) => {
		const read = await gained({ context, db, filter: notAssets, bucket: 'date' });

		expect(read).toEqual({
			'Assets:Bank 2026-10-01': 1000,
			'Assets:Bank 2026-10-03': -100,
			'Assets:Savings 2026-10-04': 10,
			'Assets:Wallet 2026-10-05': 800,
		});
	});

	it('counts every posting when there is no filter or the filter has no counter', async ({
		context,
		db,
	}) => {
		const all = await gained({ context, db });
		const bank = await gained({ context, db, filter: account('Assets:Bank') });

		expect(all).toEqual({
			'Assets:Bank 2026-10': 100,
			'Assets:Savings 2026-10': 410,
			'Assets:Wallet 2026-10': 1200,
		});
		expect(bank).toEqual({ 'Assets:Bank 2026-10': 100 });
	});

	it('combines a counter with other tests', async ({ context, db }) => {
		const either: Filter = { kind: 'any', of: [against('Income'), against('Expenses')] };
		const savings: Filter = { kind: 'all', of: [account('Assets:Savings'), either] };
		const read = await gained({ context, db, filter: savings });
		const neither = await gained({ context, db, filter: { kind: 'not', of: either } });

		expect(read).toEqual({ 'Assets:Savings 2026-10': 10 });
		expect(neither).toEqual({
			'Assets:Bank 2026-10': -800,
			'Assets:Savings 2026-10': 400,
			'Assets:Wallet 2026-10': 400,
		});
	});
});

describe('deltas by posting and at cost', () => {
	const content = [
		'2026-10-01 Salary',
		'\tAssets:Bank 1000',
		'\tIncome:Salary',
		'',
		'2026-10-02 Lunch',
		'\tExpenses:Food 100',
		'\tAssets:Bank',
		'',
		'2026-10-03 Change',
		'\tAssets:Wallet 5 USD @ 80 INR',
		'\tAssets:Bank -400',
		'',
	].join('\n');
	const span = {
		from: Temporal.PlainDate.from('2026-10-01'),
		to: Temporal.PlainDate.from('2026-10-31'),
	};

	it('gives one row for each posting, with its transaction and position', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const [balances] = (
				await Deltas.listDeltas({ ledger, ...span, accounts: ['Assets:Bank'], bucket: 'posting' })
			)._unsafeUnwrap().succeeded;
			const rows = balances?.rows ?? [];

			expect(rows.map((r) => [r.account, r.bucket, r.value])).toEqual([
				['Assets:Bank', '2026-10-01', 1000_0000000000n],
				['Assets:Bank', '2026-10-02', -100_0000000000n],
				['Assets:Bank', '2026-10-03', -400_0000000000n],
			]);
			expect(rows.map((r) => r.position)).toEqual([0, 1, 1]);
			expect(new Set(rows.map((r) => r.transaction)).size).toBe(3);
			expect(rows.every((r) => typeof r.transaction === 'string')).toBe(true);
		}));

	it('values a posting that names a price at that price when valued at cost', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: `P 2026-10-03 USD 90\n\n${content}`,
			});
			const read = async (valued: 'then' | 'cost') => {
				const [balances] = (
					await Deltas.listDeltas({
						ledger,
						...span,
						accounts: ['Assets:Wallet'],
						bucket: 'month',
						valued,
					})
				)._unsafeUnwrap().succeeded;

				return balances?.rows.find((r) => r.account === 'Assets:Wallet')?.value;
			};

			expect(await read('cost')).toBe(400_0000000000n);
			expect(await read('then')).toBe(450_0000000000n);
		}));

	it('reads a span of dates over 1827 days, the days that had deltas only', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2020-01-01 Pay\n\tAssets:Bank 500\n\tIncome:Salary\n',
			});
			const read = {
				ledger,
				from: Temporal.PlainDate.from('2020-01-01'),
				to: Temporal.PlainDate.from('2025-01-02'),
				bucket: 'date',
			} as const;

			const rows = (await Deltas.listDeltas(read))._unsafeUnwrap().succeeded[0]?.rows;

			expect(rows?.filter((r) => r.account === 'Assets:Bank')).toMatchObject([
				{ bucket: '2020-01-01', value: 500_0000000000n },
			]);
		}));

	it('closes every day of a balances read over 1827 days', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: '2020-01-01 Pay\n\tAssets:Bank 500\n\tIncome:Salary\n',
			});
			const read = {
				ledger,
				from: Temporal.PlainDate.from('2020-01-01'),
				to: Temporal.PlainDate.from('2025-01-02'),
				bucket: 'date',
				account: 'Assets:Bank',
			} as const;

			const balances = (await Deltas.listBalances(read))._unsafeUnwrap().succeeded[0];

			const bank = balances?.rows.filter((r) => r.account === 'Assets:Bank');

			expect(bank).toHaveLength(1829);
			expect(bank?.at(-1)).toMatchObject({ bucket: '2025-01-02', value: 500_0000000000n });
		}));

	it('still refuses a balances read that runs backwards', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);

			const read = await Deltas.listBalances({
				ledger,
				from: Temporal.PlainDate.from('2025-01-02'),
				to: Temporal.PlainDate.from('2020-01-01'),
				bucket: 'date',
			});

			expect(read._unsafeUnwrapErr()).toMatchObject({ type: 'SpanReversed' });
		}));
});

describe('balances of a list of accounts', () => {
	const from = Temporal.PlainDate.from('2026-10-01');
	const to = Temporal.PlainDate.from('2026-10-03');
	const content = [
		'2026-10-02 Fund',
		'\tAssets:Bank:Savings 5',
		'\tAssets:Cash 7',
		'\tAssets:Broker 11',
		'\tIncome:Gift',
		'',
	].join('\n');

	it('reads each account named and everything under it, and no other', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const read = await Deltas.listBalances({
				ledger,
				from,
				to,
				bucket: 'date',
				accounts: ['Assets:Bank', 'assets:cash'],
			});
			const rows = read._unsafeUnwrap().succeeded[0]?.rows ?? [];

			expect([...new Set(rows.map((r) => r.account))]).toEqual([
				'Assets',
				'Assets:Bank:Savings',
				'Assets:Cash',
			]);
			expect(rows.find((r) => r.account === 'Assets')?.value).toBe(12_0000000000n);
		}));

	it('fails for the first account that is not there, and reads none when the list is empty', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const read = (accounts: string[]) =>
				Deltas.listBalances({ ledger, from, to, bucket: 'date', accounts });

			expect((await read(['Assets:Cash', 'Assets:Nope']))._unsafeUnwrapErr()).toEqual({
				type: 'AccountNotFound',
				account: 'Assets:Nope',
			});
			expect((await read(['Liabilities'])).isOk()).toBe(true);
			expect((await read([]))._unsafeUnwrap().succeeded[0]?.rows).toEqual([]);
		}));

	it('reads only the accounts named, none under them, when exact', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });

			const read = await Deltas.listBalances({
				ledger,
				from,
				to,
				bucket: 'date',
				accounts: ['assets:bank', 'Assets:Cash'],
				exact: true,
				measures: ['units'],
			});
			const rows = read._unsafeUnwrap().succeeded[0]?.rows ?? [];

			expect([...new Set(rows.map((r) => r.account))].toSorted()).toEqual([
				'Assets',
				'Assets:Cash',
			]);
		}));

	it('refuses a series of any bucket but the date', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const read = (bucket: Bucket) =>
				Deltas.listBalances({
					ledger,
					from,
					to,
					bucket,
					measures: ['units', 'price'],
					series: true,
				});
			const refused = { type: 'InvalidRequest', field: 'series', reason: 'unreadable' };

			expect((await read('month'))._unsafeUnwrapErr()).toEqual(refused);
			expect((await read('year'))._unsafeUnwrapErr()).toEqual(refused);
			expect((await read('date')).isOk()).toBe(true);
		}));

	it('gives the units and price of each holding on every day as floats beside no rows, when asked', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: [
					'2026-10-02 Buy',
					'\tAssets:Broker 4 USD @ 80',
					'\tAssets:Bank',
					'',
					'P 2026-10-03 USD 90',
					'',
				].join('\n'),
			});

			const read = await Deltas.listBalances({
				ledger,
				from,
				to,
				bucket: 'date',
				measures: ['units', 'price'],
				series: true,
			});
			const balances = read._unsafeUnwrap().succeeded[0];
			const usd = balances?.series?.find((s) => s.commodity === 'USD');

			expect(balances?.rows).toEqual([]);
			expect(usd?.units).toEqual(Float64Array.from([4, 4]));
			expect(usd?.prices).toEqual(Float64Array.from([80, 90]));
		}));
});
