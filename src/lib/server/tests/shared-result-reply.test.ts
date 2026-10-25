import { describe, expect, it } from 'vitest';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';

const error: RupeaError = { type: 'UnknownError', message: 'boom' };

describe('a result as a reply', () => {
	it('wraps a success as ok with no errors', async () => {
		expect(await replyFrom(ok(1))).toEqual({ ok: true, data: 1, errors: [] });
	});

	it('wraps a failure as not-ok carrying the error', async () => {
		expect(await replyFrom(err(error))).toEqual({
			ok: false,
			data: null,
			errors: [error],
		});
	});
});

describe('a batch as a reply', () => {
	it('is ok when no item failed', async () => {
		expect(await replyFromBatch(ok({ succeeded: [1, 2, 3], failed: [] }))).toEqual({
			ok: true,
			data: [1, 2, 3],
			errors: [],
		});
	});

	it('ships successes and errors together on partial failure', async () => {
		expect(await replyFromBatch(ok({ succeeded: [1], failed: [error] }))).toEqual({
			ok: false,
			data: [1],
			errors: [error],
		});
	});

	it('propagates a fatal failure with no data', async () => {
		expect(await replyFromBatch(err(error))).toEqual({
			ok: false,
			data: null,
			errors: [error],
		});
	});
});
