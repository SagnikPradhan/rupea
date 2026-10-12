import { describe, expect, it } from 'vitest';
import { batch, batchAsync } from '#lib/server/shared/result/batch.ts';
import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { err, errAsync, ok, okAsync } from '#lib/server/shared/result/result.ts';

const error: RupeeError = { type: 'UnknownError', message: 'boom' };

describe('a batch of results', () => {
	it('splits successes from failures, in order', () => {
		expect(batch([ok(1), err(error), ok(2)])).toEqual({
			succeeded: [1, 2],
			failed: [error],
		});
	});

	it('settles pending results alongside settled ones', async () => {
		expect(await batchAsync([ok(1), okAsync(2), errAsync(error), err(error)])).toEqual(
			ok({ succeeded: [1, 2], failed: [error, error] }),
		);
	});
});
