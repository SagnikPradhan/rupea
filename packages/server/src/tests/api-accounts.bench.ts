import { cloneFixture } from '@rupea/server/tests/shared/fixtures.ts';
import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { bucketFor, closingBucketOf, spanFrom } from '@rupea/shared/balances.ts';
import { spansOf } from '@rupea/shared/dates.ts';
import { ASSETS, EXPENSES } from '@rupea/shared/money.ts';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Ledgers from '#services/ledger/application/ledger.ts';
import { createApi } from '../api/api.ts';

const TO = Temporal.PlainDate.from('2026-10-21');
const LEDGERS = ['twenty-years', 'fifty-years', 'wide'];

describe('accounts api', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);
		const first = (await provide(context, () => Ledgers.findFirstDay(ledger)))._unsafeUnwrap();
		const headers = await provide(context, () => bearerOf(ledger.owner));
		const api = await createApi(context);

		const all = spansOf({ kind: 'all' }, TO);
		const span = all.current;
		const closing = closingBucketOf(spanFrom(span, first?.toString() ?? null));
		const month = bucketFor[all.bucket];

		const get =
			(path: string, query: string, on = span) =>
			async () => {
				const response = await api.inject({
					url: `/api/ledgers/${ledger.handle}/${path}?from=${on.from}&to=${on.to}&${query}`,
					headers,
				});
				expect(response.statusCode, response.body).toBe(200);
			};

		await bench.compare(
			bench('worth all', get('balances', `bucket=${closing}&measures[0]=value`)),
			bench(
				'holdings all',
				get(
					'balances',
					`bucket=date&measures[0]=value&measures[1]=units&measures[2]=price&measures[3]=cost&account=${ASSETS}`,
					{ from: span.to, to: span.to },
				),
			),
			bench('deltas all', get('deltas', `bucket=${month}&account=${EXPENSES}&measures[0]=value`)),
			bench('drops all', get('drops', '')),
			bench('returns all', get('returns', '')),
			bench('bridge all', get('bridge', '')),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});
