import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Deltas from '#services/ledger/application/deltas.ts';
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
const CUSTOM_CASES = ['home worth', 'home bridge', 'accounts drops', 'accounts invested'];

describe('accounts', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);
		const first = (await provide(context, () => Ledgers.findFirstDay(ledger)))._unsafeUnwrap();

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
					account,
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
							account,
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
					account,
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
			bench('checks', checks),
			bench('index alone', index),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});
