import { ORPCError } from '@orpc/server';
import { fault } from '@rupea/shared/error.ts';
import { describe, expect, it } from 'vitest';
import { err, ok } from '#lib/server/shared/result/result.ts';
import { answer } from '../api/answer.ts';
import { sanitise } from '../api/sanitise.ts';

describe('answering a result', () => {
	it('hands back the value of one that worked', async () => {
		expect(await answer(Promise.resolve(ok(7)))).toBe(7);
	});

	it('rejects with the status of the error and the error as data', async () => {
		const error = fault('StorageConflict', { key: 'a', expected: null, actual: 'b' });

		const rejected = await answer(err(error)).catch((e: ORPCError<string, unknown>) => e);

		expect(rejected).toMatchObject({ code: 'CONFLICT', status: 409, defined: true, data: error });
	});

	it('keeps what a 502 says about the feed', async () => {
		const error = fault('FeedUnavailable', { feed: 'f', symbol: 's', status: 503 });

		const rejected = await answer(err(error)).catch((e: ORPCError<string, unknown>) => e);

		expect(rejected).toMatchObject({ code: 'UPSTREAM', status: 502, data: error });
	});

	it('answers an invalid feed response with a 502', async () => {
		const error = fault('FeedInvalidResponse', { feed: 'f', symbol: 's', reason: 'bad json' });

		const rejected = await answer(err(error)).catch((e: ORPCError<string, unknown>) => e);

		expect(rejected).toMatchObject({ code: 'UPSTREAM', status: 502, data: error });
	});

	it('hides what a 500 says but logs it as the cause', async () => {
		const error = fault('CannotReadFile', { path: '/srv/secret', reason: 'EACCES' });

		const rejected = await answer(err(error)).catch((e: ORPCError<string, unknown>) => e);

		expect(rejected).toMatchObject({
			code: 'FAULT',
			status: 500,
			data: { type: 'UnknownError', message: 'Internal server error' },
			cause: error,
		});
	});
});

describe('sanitising an error', () => {
	it('keeps the error of a status below 500', () => {
		const error = fault('NameTaken', { name: 'a' });

		expect(sanitise(error)).toBe(error);
	});

	it('replaces the error of a 500 with a generic one', () => {
		const error = fault('CannotReadFile', { path: '/srv/secret', reason: 'EACCES' });

		expect(sanitise(error)).toEqual({ type: 'UnknownError', message: 'Internal server error' });
	});
});
