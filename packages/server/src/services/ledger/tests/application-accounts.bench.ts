import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Budgets from '#services/ledger/application/budgets.ts';
import * as Deltas from '#services/ledger/application/deltas.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Ledgers from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { ResultAsync } from '#lib/server/shared/result/result.ts';
import { bucketFor, closingBucketOf, spanFrom } from '@rupea/shared/balances.ts';
import { openingOf, type Period, type Span, spansOf } from '@rupea/shared/dates.ts';
import { ASSETS, EXPENSES, INCOME, LIABILITIES } from '@rupea/shared/money.ts';
import { cloneFixture, timed } from '@rupea/server/tests/shared/fixtures.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe } from 'vitest';

const TO = Temporal.PlainDate.from('2026-10-21');
const LEDGERS = ['twenty-years', 'fifty-years', 'wide'];

const PAGES: Record<string, Period> = {
	month: { kind: 'month', at: TO.toPlainYearMonth().toString() },
	year: { kind: 'year', at: String(TO.year) },
	all: { kind: 'all' },
};
const CUSTOM: Record<string, Period> = {
	'5y': { kind: 'custom', from: TO.subtract({ years: 5 }).toString(), to: TO.toString() },
	'10y': { kind: 'custom', from: TO.subtract({ years: 10 }).toString(), to: TO.toString() },
};
const BUDGETS = [
	'B * Expenses:Home',
	'- limit: 60000',
	'',
	'B * Expenses:Food',
	'- limit: 15000',
	'',
	'B * Expenses:Shopping',
	'- limit: 8000',
	'',
	'B * Expenses:Fun',
	'- limit: 5000',
	'- start: 2026-04-25',
	'',
	'B * Expenses:Transport',
	'- limit: 4000',
	'',
	'B * Expenses:Travel',
	'- limit: 120000',
	'- period: year',
	'- start: 2026-04-01',
	'',
	'B * Expenses:Health',
	'- limit: 3000',
	'',
	'B * Expenses:Bills',
	'- limit: 9000',
	'',
	'B 2026-06-10 Expenses:Food',
	'- limit: 18000',
	'- start: 2026-06-10',
].join('\n');
const MANY = 30;
const CUSTOM_CASES = ['home worth', 'home bridge', 'accounts drops', 'accounts invested'];

describe('accounts', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);
		const first = (await provide(context, () => Ledgers.findFirstDay(ledger)))._unsafeUnwrap();

		await provide(context, () =>
			Files.createFile({ ledger, key: 'budgets.rupea', content: BUDGETS }),
		);

		const spanOf = (p: Period) => spansOf(p, TO).current;
		const closingBucketIn = (s: Span) => closingBucketOf(spanFrom(s, first?.toString() ?? null));

		const holdings = (p: Period) => {
			const on = spanOf(p).to;
			return timed(context, () =>
				Deltas.listBalances({
					ledger,
					from: on,
					to: on,
					bucket: 'date',
					measures: ['value', 'units', 'price', 'cost'],
				}),
			);
		};
		const worth = (p: Period) => {
			const span = spanOf(p);
			return timed(context, () =>
				Deltas.listBalances({
					ledger,
					...span,
					bucket: closingBucketIn(span),
					measures: ['value'],
				}),
			);
		};
		const invested = (p: Period, account: string) => {
			const span = spanOf(p);
			return timed(context, () =>
				Deltas.listBalances({
					ledger,
					...span,
					accounts: [account],
					bucket: closingBucketIn(span),
					measures: ['value', 'paid', 'units'],
				}),
			);
		};
		const deltas = (p: Period, account: string) => {
			const { current, previous, bucket } = spansOf(p, TO);
			const spans = previous ? [current, previous] : [current];
			return timed(context, () =>
				ResultAsync.combine(
					spans.map((span) =>
						Deltas.listDeltas({
							ledger,
							...span,
							accounts: [account],
							bucket: bucketFor[bucket],
							measures: ['value', 'inflow', 'outflow'],
						}),
					),
				),
			);
		};
		const daily = (p: Period, account: string) =>
			timed(context, () =>
				Deltas.listDeltas({
					ledger,
					...spanOf(p),
					accounts: [account],
					bucket: 'day',
					aggregate: 'average',
				}),
			);
		const drops = (p: Period) =>
			timed(context, () => Accounts.listDrops({ ledger, ...spanOf(p), account: null }));
		const bridge = (p: Period) =>
			timed(context, () => Accounts.findBridge({ ledger, ...spanOf(p) }));
		const returns = (p: Period) =>
			timed(context, () => Accounts.listReturns({ ledger, ...spanOf(p) }));

		const tree = timed(context, () => Accounts.listAccounts(ledger));
		const lots = timed(context, () =>
			Accounts.listLots({ ledger, account: 'Assets:IBKR', commodity: 'USD' }),
		);
		const budgets = timed(context, () => Budgets.listBudgets({ ledger, from: TO, to: TO }));
		const staged: Promise<unknown>[] = [];
		const stage = () =>
			(staged[0] ??= provide(context, async () => {
				const shared = (await Deltas.findShared(ledger.id))._unsafeUnwrap();
				const names = shared.tree
					.map((n) => n.name)
					.filter((n) => n.startsWith('Expenses:') && !BUDGETS.includes(`B * ${n}\n`))
					.slice(0, MANY);
				const content = names
					.map(
						(n, i) =>
							`B * ${n}\n- limit: 1000\n- start: 2026-04-${String(i + 1).padStart(2, '0')}\n`,
					)
					.join('\n');

				return Files.createFile({ ledger, key: 'many.rupea', content });
			}).then((r) => r._unsafeUnwrap()));
		const budgetsFromManyDays = async () => {
			await stage();
			await budgets();
		};
		const checks = timed(context, () => Sync.listProblems(ledger));
		const index = timed(context, () => Sync.syncIndex(ledger));

		const cases = {
			'home worth': worth,
			'home bridge': bridge,
			'accounts holdings': holdings,
			'accounts drops': drops,
			'accounts invested': (p: Period) => invested(p, ASSETS),
			'accounts returns': returns,
			'expenses deltas': (p: Period) => deltas(p, EXPENSES),
			'expenses daily': (p: Period) => daily(p, EXPENSES),
			'income deltas': (p: Period) => deltas(p, INCOME),
			'income invested': (p: Period) => invested(openingOf(p, TO), ASSETS),
			'liabilities deltas': (p: Period) => deltas(p, LIABILITIES),
		};
		const benchesOf = (periods: Record<string, Period>, names: string[]) =>
			Object.entries(periods).flatMap(([span, p]) =>
				Object.entries(cases)
					.filter(([name]) => names.includes(name))
					.map(([name, run]) => bench(`${name} ${span}`, run(p))),
			);

		await bench.compare(
			...benchesOf(PAGES, Object.keys(cases)),
			...benchesOf(CUSTOM, CUSTOM_CASES),
			bench('tree', tree),
			bench('lots', lots),
			bench('budgets', budgets),
			bench('checks', checks),
			bench('index alone', index),
			bench('budgets 30 starts', budgetsFromManyDays),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});
