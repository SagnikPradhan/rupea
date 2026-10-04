/**
 * The result vocabulary shared across domains: `Result` and `ResultAsync`
 * (neverthrow's, fixed to `RupeeError`) for fail-fast operations, `Batch`
 * for operations over many independent items, and `Response`, the envelope
 * every remote function returns at its edge.
 *
 * Per-item failures accumulate as a plain list all the way to the consumer;
 * nothing here collapses them into a single wrapping error.
 *
 * Import these from here, never from `neverthrow` directly.
 */
import * as neverthrow from 'neverthrow';
import { unknownError, type RupeeError } from './error';

export type Result<T> = neverthrow.Result<T, RupeeError>;

export type ResultAsync<T> = neverthrow.ResultAsync<T, RupeeError>;

export const ResultAsync = neverthrow.ResultAsync;

export { err, errAsync, ok, okAsync } from 'neverthrow';

/** An effect, and how to name what it throws. */
export type Attempt<T> = {
	try: () => PromiseLike<T>;
	catch: (thrown: unknown) => RupeeError;
};

/**
 * Run an effect at an outbound adapter's edge, turning anything it throws,
 * synchronously or by rejecting, into a `RupeeError`: an `UnknownError`,
 * unless a `catch` names it. The only place a `catch` belongs.
 */
export const attempt = <T>(effect: (() => PromiseLike<T>) | Attempt<T>): ResultAsync<T> => {
	const { try: run, catch: name } =
		typeof effect === 'function' ? { try: effect, catch: unknownError } : effect;
	return ResultAsync.fromThrowable(async () => run(), name)();
};

/**
 * `run`'s value, or `undefined` if it throws. For synchronous APIs that throw
 * on bad input, like `RegExp` and date-fns. With `attempt`, the only place a
 * `try` belongs.
 */
export const safely = <T>(run: () => T): T | undefined => {
	// eslint-disable-next-line functional/no-try-statements -- the one wrapper
	try {
		return run();
	} catch {
		return undefined;
	}
};

/** Run `steps` one at a time, failing at the first to fail. */
export const concat = <T>(steps: (() => ResultAsync<T[]>)[]): ResultAsync<T[]> =>
	steps.reduce<ResultAsync<T[]>>(
		(d, s) => d.andThen((p) => s().map((n) => [...p, ...n])),
		neverthrow.okAsync([]),
	);

/**
 * The outcome of an operation over many independent items: the successes,
 * with any per-item failures carried alongside as data rather than as an
 * error.
 */
export type Batch<T> = { succeeded: T[]; failed: RupeeError[] };

export const batch = <T>(results: Result<T>[]): Batch<T> => ({
	succeeded: results.flatMap((r) => (r.isOk() ? [r.value] : [])),
	failed: results.flatMap((r) => (r.isOk() ? [] : [r.error])),
});

/** `batch` over results still to settle; it never fails itself. */
export const batchAsync = <T>(res: (Result<T> | ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	ResultAsync.fromSafePromise(Promise.all(res).then(batch));

/**
 * The envelope every remote function returns. `ok` is false when any error
 * rode along, even when `data` is still populated (partial success).
 */
export type Response<T> = {
	ok: boolean;
	data: T | null;
	errors: RupeeError[];
};

/** Shape a fail-fast result into a `Response`. */
export const fromResult = <T>(result: Result<T>): Response<T> =>
	result.match(
		(d) => ({ ok: true, data: d, errors: [] }),
		(err) => ({ ok: false, data: null, errors: [err] }),
	);

/**
 * Shape a partial result into a `Response`: successes always ship; any
 * per-item failures ride along under `errors`.
 */
export const fromBatch = <T>(result: Result<Batch<T>>): Response<T[]> =>
	result.match(
		({ succeeded, failed }) => ({
			ok: failed.length === 0,
			data: succeeded,
			errors: failed,
		}),
		(err) => ({ ok: false, data: null, errors: [err] }),
	);
