import type { Batch } from './batch';
import type { RupeeError } from './error';
import type { Result } from './result';

// `ok` is false whenever errors rode along, even with `data` present.
export type Reply<T> = {
	ok: boolean;
	data: T | null;
	errors: RupeeError[];
};

export const replyFrom = <T>(result: Result<T>): Reply<T> =>
	result.match(
		(d) => ({ ok: true, data: d, errors: [] }),
		(e) => ({ ok: false, data: null, errors: [e] }),
	);

export const replyFromBatch = <T>(result: Result<Batch<T>>): Reply<T[]> =>
	result.match(
		({ succeeded, failed }) => ({
			ok: failed.length === 0,
			data: succeeded,
			errors: failed,
		}),
		(e) => ({ ok: false, data: null, errors: [e] }),
	);
