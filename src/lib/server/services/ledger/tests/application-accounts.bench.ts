import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { BEGINNING } from '#lib/shared/dates.ts';
import { cloneFixture, timed } from '#tests/shared/fixtures.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe } from 'vitest';

const TO = Temporal.PlainDate.from('2026-10-21');
const LEDGERS = ['twenty-years', 'fifty-years', 'wide'];

describe('accounts', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);

		const worth = (f: Temporal.PlainDate) =>
			timed(context, () => Accounts.listWorth({ ledger, from: f, to: TO, account: null }));
		const returns = (f: Temporal.PlainDate) =>
			timed(context, () => Accounts.listReturns({ ledger, from: f, to: TO }));
		const spending = (f: Temporal.PlainDate) =>
			timed(context, () =>
				Accounts.listSpending({
					ledger,
					spans: [{ from: f, to: TO }],
					bucket: 'month',
					account: 'Expenses',
				}),
			);
		const holdings = timed(context, () => Accounts.listAccounts({ ledger, day: TO }));
		const tree = timed(context, () => Accounts.listAccountTree(ledger));
		const lots = timed(context, () =>
			Accounts.listLots({ ledger, account: 'Assets:IBKR', commodity: 'USD' }),
		);
		const checks = timed(context, () => Sync.listProblems(ledger));
		const index = timed(context, () => Sync.syncIndex(ledger));

		await bench.compare(
			bench('worth 1m', worth(TO.subtract({ months: 1 }))),
			bench('worth ytd', worth(TO.with({ month: 1, day: 1 }))),
			bench('worth 1y', worth(TO.subtract({ years: 1 }))),
			bench('returns 1m', returns(TO.subtract({ months: 1 }))),
			bench('returns ytd', returns(TO.with({ month: 1, day: 1 }))),
			bench('returns 1y', returns(TO.subtract({ years: 1 }))),
			bench('returns all', returns(Temporal.PlainDate.from(BEGINNING))),
			bench('spending 1y', spending(TO.subtract({ years: 1 }))),
			bench('spending all', spending(Temporal.PlainDate.from(BEGINNING))),
			bench('holdings', holdings),
			bench('tree', tree),
			bench('lots', lots),
			bench('checks', checks),
			bench('index alone', index),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});
