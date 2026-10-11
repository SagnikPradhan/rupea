import { describe, expect, it } from 'vitest';
import type { RupeeError } from '#lib/server/shared/error.ts';
import {
	attempt,
	batch,
	batchAsync,
	concat,
	err,
	errAsync,
	fromBatch,
	fromResult,
	ok,
	okAsync,
} from '#lib/server/shared/result.ts';

const error: RupeeError = { type: 'UnknownError', message: 'boom', cause: [] };

describe('a result as a response', () => {
	it('wraps a success as ok with no errors', () => {
		expect(fromResult(ok(1))).toEqual({ ok: true, data: 1, errors: [] });
	});

	it('wraps a failure as not-ok carrying the error', () => {
		expect(fromResult(err(error))).toEqual({
			ok: false,
			data: null,
			errors: [error],
		});
	});
});

describe('a batch as a response', () => {
	it('is ok when no item failed', () => {
		expect(fromBatch(ok({ succeeded: [1, 2, 3], failed: [] }))).toEqual({
			ok: true,
			data: [1, 2, 3],
			errors: [],
		});
	});

	it('ships successes and errors together on partial failure', () => {
		expect(fromBatch(ok({ succeeded: [1], failed: [error] }))).toEqual({
			ok: false,
			data: [1],
			errors: [error],
		});
	});

	it('propagates a fatal failure with no data', () => {
		expect(fromBatch(err(error))).toEqual({
			ok: false,
			data: null,
			errors: [error],
		});
	});
});

describe('attempting an effect', () => {
	it('succeeds with what the effect resolves to', async () => {
		expect(await attempt(() => Promise.resolve(1))).toEqual(ok(1));
	});

	it('fails with an unknown error when the effect rejects', async () => {
		expect(await attempt(() => Promise.reject(new Error('boom')))).toEqual(err(error));
	});

	it('fails with an unknown error when the effect throws before its promise', async () => {
		expect(
			await attempt(() => {
				throw new Error('boom');
			}),
		).toEqual(err(error));
	});

	it('fails with the error its catch names', async () => {
		expect(
			await attempt({
				try: () => Promise.reject(new Error('boom')),
				catch: () => ({ type: 'AuthUnauthenticated', cause: [] }),
			}),
		).toEqual(err({ type: 'AuthUnauthenticated', cause: [] }));
	});
});

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

describe('concatenating steps', () => {
	it('runs each step after the last has settled, keeping their order', async () => {
		const started: number[] = [];
		const step = (n: number) => () => {
			started.push(n);
			return attempt(() => new Promise<number[]>((d) => setTimeout(d, 10 - n, [n])));
		};
		expect(await concat([step(1), step(2), step(3)])).toEqual(ok([1, 2, 3]));
		expect(started).toEqual([1, 2, 3]);
	});

	it('stops at the first step to fail', async () => {
		const ran: number[] = [];
		const step = (n: number) => () => {
			ran.push(n);
			return n === 2 ? errAsync(error) : okAsync([n]);
		};
		expect(await concat([step(1), step(2), step(3)])).toEqual(err(error));
		expect(ran).toEqual([1, 2]);
	});

	it('is empty with no steps', async () => {
		expect(await concat([])).toEqual(ok([]));
	});
});
