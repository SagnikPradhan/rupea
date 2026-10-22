import type { Batch } from './batch';
import type { RupeeError } from './error';
import type { Result } from './result';

// `ok` is false whenever errors rode along, even with `data` present.
export type Reply<T> = {
	ok: boolean;
	data: T | null;
	errors: RupeeError[];
};

/** Takes a result, or one on its way, such as a `ResultAsync`, whose own `then` is typed too loosely for a remote function. */
export const replyFrom = <T>(result: Result<T> | PromiseLike<Result<T>>): Promise<Reply<T>> =>
	Promise.resolve(result).then((r) =>
		r.match(
			(d) => ({ ok: true, data: d, errors: [] }),
			(e) => ({ ok: false, data: null, errors: [e] }),
		),
	);

export const replyFromBatch = <T>(
	result: Result<Batch<T>> | PromiseLike<Result<Batch<T>>>,
): Promise<Reply<T[]>> =>
	Promise.resolve(result).then((r) =>
		r.match(
			({ succeeded, failed }) => ({ ok: failed.length === 0, data: succeeded, errors: failed }),
			(e) => ({ ok: false, data: null, errors: [e] }),
		),
	);
