import { describe, expect, it } from 'vitest';
import { fault, type RupeaError, unknownError } from '#lib/server/shared/result/error.ts';
import { attempt, err, errAsync, inOrder, ok, okAsync } from '#lib/server/shared/result/result.ts';

const error: RupeaError = { type: 'UnknownError', message: 'boom' };

describe('building an error', () => {
	it('tags the fields with their type', () => {
		expect(fault('NameTaken', { name: 'a' })).toEqual({ type: 'NameTaken', name: 'a' });
	});

	it('takes no fields for an error that carries none', () => {
		expect(fault('AuthUnauthenticated')).toEqual({ type: 'AuthUnauthenticated' });
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

	it('hands onThrow the thrown value', async () => {
		expect(
			await attempt(
				() => Promise.reject(new Error('boom')),
				(t) => fault('CannotReadFile', { path: 'a', reason: 'b', cause: [unknownError(t)] }),
			),
		).toEqual(err(fault('CannotReadFile', { path: 'a', reason: 'b', cause: [error] })));
	});

	it('fails with the error onThrow names', async () => {
		expect(
			await attempt(
				() => Promise.reject(new Error('boom')),
				() => ({ type: 'AuthUnauthenticated' }),
			),
		).toEqual(err({ type: 'AuthUnauthenticated' }));
	});
});

describe('running steps in order', () => {
	it('runs each step after the last has settled, keeping their order', async () => {
		const started: number[] = [];
		const step = (n: number) => () => {
			started.push(n);
			return attempt(() => new Promise<number>((d) => setTimeout(d, 10 - n, n)));
		};
		expect(await inOrder([step(1), step(2), step(3)])).toEqual(ok([1, 2, 3]));
		expect(started).toEqual([1, 2, 3]);
	});

	it('stops at the first step to fail', async () => {
		const ran: number[] = [];
		const step = (n: number) => () => {
			ran.push(n);
			return n === 2 ? errAsync(error) : okAsync(n);
		};
		expect(await inOrder([step(1), step(2), step(3)])).toEqual(err(error));
		expect(ran).toEqual([1, 2]);
	});

	it('is empty with no steps', async () => {
		expect(await inOrder([])).toEqual(ok([]));
	});
});
