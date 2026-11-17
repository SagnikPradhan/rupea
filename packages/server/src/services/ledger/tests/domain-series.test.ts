import { NO_AMOUNT, readSeries, writeSeries } from '#services/ledger/domain/series.ts';
import { describe, expect, it } from 'vitest';

describe('series', () => {
	it.for([
		['nothing', 0n],
		['a small amount', 1500_0000000000n],
		['a debt', -1n],
		['more than eight bytes hold', 2n ** 64n + 7n],
		['a debt more than eight bytes hold', -(2n ** 64n) - 7n],
		['seventy bits', 2n ** 70n + 12_345n],
		['the largest numeric(38)', 10n ** 38n - 1n],
		['the smallest numeric(38)', -(10n ** 38n) + 1n],
		['no amount', NO_AMOUNT],
	] as const)('reads back %s', ([, amount]) => {
		expect(readSeries(writeSeries([amount, 5n]))).toEqual([amount, 5n]);
	});

	it('reads a series that does not start on an eight byte boundary', () => {
		const amounts = [3n, NO_AMOUNT, 2n ** 70n, -1n];
		const shifted = Buffer.concat([Buffer.alloc(3), writeSeries(amounts)]).subarray(3);

		expect(readSeries(shifted)).toEqual(amounts);
	});

	it('takes sixteen bytes a day', () => {
		expect(writeSeries([1n, 2n, 3n])).toHaveLength(48);
	});
});
