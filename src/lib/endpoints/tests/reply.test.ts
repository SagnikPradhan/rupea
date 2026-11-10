import { ORPCError } from '@orpc/client';
import { replyFromBatchCall, replyFromCall } from '#lib/endpoints/reply.ts';
import type { RupeaError } from '@rupea/shared/error.ts';
import { describe, expect, it } from 'vitest';

const notFound: RupeaError = { type: 'LedgerNotFound', handle: 'home' };

const refused = (status: number, data?: unknown) =>
	new ORPCError('REFUSED', { status, defined: true, data });

describe('replying to a call', () => {
	it('carries what the call answered', async () => {
		expect(await replyFromCall(Promise.resolve(42))).toEqual({ ok: true, data: 42, errors: [] });
	});

	it('rebuilds the failure the API refused with', async () => {
		const reply = await replyFromCall(Promise.reject(refused(404, notFound)));

		expect(reply).toEqual({ ok: false, data: null, errors: [notFound] });
	});

	it('rebuilds a cause nested in the failure', async () => {
		const cause: RupeaError = { type: 'StorageNotFound', key: 'a.rupea' };
		const failure: RupeaError = {
			type: 'CannotReadFile',
			path: 'a.rupea',
			reason: 'x',
			cause: [cause],
		};

		const reply = await replyFromCall(Promise.reject(refused(500, failure)));

		expect(reply.errors).toEqual([failure]);
	});

	it('takes a refusal without a session for an unauthenticated one', async () => {
		const reply = await replyFromCall(Promise.reject(refused(401)));

		expect(reply.errors).toEqual([{ type: 'AuthUnauthenticated' }]);
	});

	it('reads the first invalid field of a refused input, without its value', async () => {
		const issues = [
			{ path: ['files', '0'], message: 'A name is 255 bytes.' },
			{ path: ['handle'], message: 'Not a ledger handle.' },
		];

		const reply = await replyFromCall(Promise.reject(refused(400, { issues })));

		expect(reply.errors).toEqual([
			{ type: 'UnknownError', message: 'A name is 255 bytes. (files.0)' },
		]);
	});

	it('says plainly when a body was too large', async () => {
		const reply = await replyFromCall(Promise.reject(refused(413)));

		expect(reply.errors).toEqual([{ type: 'UnknownError', message: 'That is too large to send.' }]);
	});

	it.each([
		['a refusal that carries no failure', refused(400, { issues: [] }), 'REFUSED'],
		['a network failure', new TypeError('fetch failed'), 'fetch failed'],
		['something thrown that is no error', 'boom', 'boom'],
	])('answers %s with the generic fault', async (_, thrown, message) => {
		const reply = await replyFromCall(Promise.reject(thrown));

		expect(reply).toEqual({ ok: false, data: null, errors: [{ type: 'UnknownError', message }] });
	});
});

describe('replying to a batch', () => {
	it('is not ok when some failed, and keeps what succeeded', async () => {
		const reply = await replyFromBatchCall(
			Promise.resolve({ succeeded: [1, 2], failed: [notFound] }),
		);

		expect(reply).toEqual({ ok: false, data: [1, 2], errors: [notFound] });
	});

	it('is ok when none failed', async () => {
		const reply = await replyFromBatchCall(Promise.resolve({ succeeded: [1], failed: [] }));

		expect(reply).toEqual({ ok: true, data: [1], errors: [] });
	});

	it('fails whole when the call is refused', async () => {
		const reply = await replyFromBatchCall(Promise.reject(refused(404, notFound)));

		expect(reply).toEqual({ ok: false, data: null, errors: [notFound] });
	});
});
