import { NO_AMOUNT, readSeries, writeSeries } from '#services/ledger/domain/series.ts';
import { describe, expect, it } from 'vitest';

describe('series', () => {
	it.for([
		['nothing', 0n],
		['a small amount', 1500_0000000000n],
		['a debt', -1n],
		['more than eight bytes hold', 2n ** 64n + 7n],
		['a debt more than eight bytes hold', -(2n ** 64n) - 7n],
		['the largest numeric(38)', 10n ** 38n - 1n],
		['the smallest numeric(38)', -(10n ** 38n) + 1n],
		['no amount', NO_AMOUNT],
	] as const)('reads back %s', ([, amount]) => {
		expect(readSeries(writeSeries([amount, 5n]))).toEqual([amount, 5n]);
	});

	it('takes sixteen bytes a day', () => {
		expect(writeSeries([1n, 2n, 3n]).length).toBe(48);
	});
});
