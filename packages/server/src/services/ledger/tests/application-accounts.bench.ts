import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { BEGINNING } from '@rupea/shared/dates.ts';
import { cloneFixture, timed } from '@rupea/server/tests/shared/fixtures.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe } from 'vitest';

const TO = Temporal.PlainDate.from('2026-10-21');
const LEDGERS = ['twenty-years', 'fifty-years', 'wide'];

describe('accounts', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);

		const worth = (f: Temporal.PlainDate, bucket: 'date' | 'month' = 'date') =>
			timed(context, () =>
				Accounts.listBalances({
					ledger,
					from: f,
					to: TO,
					bucket,
					accumulate: 'historical',
				}),
			);
		const invested = (f: Temporal.PlainDate, bucket: 'date' | 'month' = 'date') =>
			timed(context, () =>
				Accounts.listBalances({
					ledger,
					from: f,
					to: TO,
					account: 'Assets',
					bucket,
					accumulate: 'historical',
					measures: ['value', 'paid', 'units'],
				}),
			);
		const cost = (f: Temporal.PlainDate, bucket: 'date' | 'month' = 'date') =>
			timed(context, () =>
				Accounts.listBalances({
					ledger,
					from: f,
					to: TO,
					account: 'Assets',
					bucket,
					accumulate: 'historical',
					measures: ['value', 'units', 'price', 'cost'],
				}),
			);
		const drops = (f: Temporal.PlainDate) =>
			timed(context, () => Accounts.listDrops({ ledger, from: f, to: TO, account: null }));
		const bridge = (f: Temporal.PlainDate) =>
			timed(context, () => Accounts.findBridge({ ledger, from: f, to: TO }));
		const returns = (f: Temporal.PlainDate) =>
			timed(context, () => Accounts.listReturns({ ledger, from: f, to: TO }));
		const spending = (f: Temporal.PlainDate) =>
			timed(context, () =>
				Accounts.listBalances({
					ledger,
					from: f,
					to: TO,
					bucket: 'month',
					aggregate: 'sum',
					account: 'Expenses',
				}),
			);
		const history = (f: Temporal.PlainDate) =>
			timed(context, () =>
				Accounts.listBalances({
					ledger,
					from: f,
					to: TO,
					bucket: 'month',
					accumulate: 'historical',
				}),
			);
		const daily = (f: Temporal.PlainDate) =>
			timed(context, () =>
				Accounts.listBalances({
					ledger,
					from: f,
					to: TO,
					bucket: 'day',
					aggregate: 'average',
					account: 'Expenses',
				}),
			);
		const holdings = timed(context, () =>
			Accounts.listBalances({
				ledger,
				from: TO,
				to: TO,
				bucket: 'date',
				accumulate: 'historical',
				measures: ['value', 'units', 'price', 'cost'],
			}),
		);
		const tree = timed(context, () => Accounts.listAccounts(ledger));
		const lots = timed(context, () =>
			Accounts.listLots({ ledger, account: 'Assets:IBKR', commodity: 'USD' }),
		);
		const checks = timed(context, () => Sync.listProblems(ledger));
		const index = timed(context, () => Sync.syncIndex(ledger));

		await bench.compare(
			bench('worth 1m', worth(TO.subtract({ months: 1 }))),
			bench('worth ytd', worth(TO.with({ month: 1, day: 1 }))),
			bench('worth 1y', worth(TO.subtract({ years: 1 }))),
			bench('worth 10y', worth(TO.subtract({ years: 10 }), 'month')),
			bench('worth 20y', worth(TO.subtract({ years: 20 }), 'month')),
			bench('worth all', worth(Temporal.PlainDate.from(BEGINNING), 'month')),
			bench('invested 1m', invested(TO.subtract({ months: 1 }))),
			bench('invested 1y', invested(TO.subtract({ years: 1 }))),
			bench('invested 10y', invested(TO.subtract({ years: 10 }), 'month')),
			bench('invested all', invested(Temporal.PlainDate.from(BEGINNING), 'month')),
			bench('holdings 1y', cost(TO.subtract({ years: 1 }))),
			bench('holdings 10y', cost(TO.subtract({ years: 10 }), 'month')),
			bench('drops 1y', drops(TO.subtract({ years: 1 }))),
			bench('drops 10y', drops(TO.subtract({ years: 10 }))),
			bench('drops all', drops(Temporal.PlainDate.from(BEGINNING))),
			bench('bridge 1y', bridge(TO.subtract({ years: 1 }))),
			bench('bridge 10y', bridge(TO.subtract({ years: 10 }))),
			bench('bridge all', bridge(Temporal.PlainDate.from(BEGINNING))),
			bench('returns 1m', returns(TO.subtract({ months: 1 }))),
			bench('returns ytd', returns(TO.with({ month: 1, day: 1 }))),
			bench('returns 1y', returns(TO.subtract({ years: 1 }))),
			bench('returns all', returns(Temporal.PlainDate.from(BEGINNING))),
			bench('spending 1y', spending(TO.subtract({ years: 1 }))),
			bench('spending all', spending(Temporal.PlainDate.from(BEGINNING))),
			bench('history 1y', history(TO.subtract({ years: 1 }))),
			bench('history all', history(Temporal.PlainDate.from(BEGINNING))),
			bench('daily 1y', daily(TO.subtract({ years: 1 }))),
			bench('daily all', daily(Temporal.PlainDate.from(BEGINNING))),
			bench('holdings', holdings),
			bench('tree', tree),
			bench('lots', lots),
			bench('checks', checks),
			bench('index alone', index),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});
