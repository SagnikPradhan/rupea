import { ORPCError } from '@orpc/client';
import { fault, RupeaError, unknownError } from '@rupea/shared/errors.ts';
import type { Batch, Reply } from '@rupea/shared/errors.ts';
import * as v from 'valibot';

/** The reply to a batch call with nothing to work through, which makes no call. */
export const NOTHING: Reply<never[]> = { ok: true, data: [], errors: [] };

/**
 * The reply to a call of the API: its answer, or the failure it was refused
 * with.
 */
export const replyFromCall = <T>(call: Promise<T>): Promise<Reply<T>> =>
	call.then(
		(d) => ({ ok: true, data: d, errors: [] }),
		(e: unknown) => ({ ok: false, data: null, errors: [errorOf(e)] }),
	);

/**
 * As above for a call that works through many things, whose failures ride
 * along.
 */
export const replyFromBatchCall = <T>(call: Promise<Batch<T>>): Promise<Reply<T[]>> =>
	call.then(
		({ succeeded, failed }) => ({ ok: failed.length === 0, data: succeeded, errors: failed }),
		(e: unknown) => ({ ok: false, data: null, errors: [errorOf(e)] }),
	);

const Issue = v.object({ path: v.array(v.string()), message: v.string() });

const Issues = v.object({ issues: v.tupleWithRest([Issue], Issue) });

const errorOf = (thrown: unknown): RupeaError => {
	if (!(thrown instanceof ORPCError)) return unknownError(thrown);

	const refusal = v.safeParse(RupeaError, thrown.data);
	if (refusal.success) return refusal.output;
	if (thrown.status === 401) return fault('AuthUnauthenticated');
	if (thrown.status === 413) return unknownError(new Error('That is too large to send.'));

	const invalid = v.safeParse(Issues, thrown.data);
	if (invalid.success) return unknownError(new Error(describe(invalid.output.issues[0])));

	return unknownError(thrown);
};

const describe = ({ path, message }: { path: string[]; message: string }) =>
	path.length === 0 ? message : `${message} (${path.join('.')})`;
