import * as neverthrow from 'neverthrow';
import { unknownError, type RupeeError } from './error';

export type Result<T> = neverthrow.Result<T, RupeeError>;

export type ResultAsync<T> = neverthrow.ResultAsync<T, RupeeError>;

export const ResultAsync = neverthrow.ResultAsync;

export { err, errAsync, ok, okAsync } from 'neverthrow';

export type Attempt<T> = {
	try: () => PromiseLike<T>;
	catch: (thrown: unknown) => RupeeError;
};

export const attempt = <T>(effect: (() => PromiseLike<T>) | Attempt<T>): ResultAsync<T> => {
	const { try: run, catch: name } =
		typeof effect === 'function' ? { try: effect, catch: unknownError } : effect;
	return ResultAsync.fromThrowable(async () => run(), name)();
};

export const safely = <T>(run: () => T): T | undefined => {
	// eslint-disable-next-line functional/no-try-statements -- the one wrapper
	try {
		return run();
	} catch {
		return undefined;
	}
};

export const concat = <T>(steps: (() => ResultAsync<T[]>)[]): ResultAsync<T[]> =>
	steps.reduce<ResultAsync<T[]>>(
		(d, s) => d.andThen((p) => s().map((n) => [...p, ...n])),
		neverthrow.okAsync([]),
	);

export const inOrder = async (l: (() => Promise<unknown>)[]): Promise<void> => {
	for (const f of l) await f();
};

export type Batch<T> = { succeeded: T[]; failed: RupeeError[] };

export const batch = <T>(results: Result<T>[]): Batch<T> => ({
	succeeded: results.flatMap((r) => (r.isOk() ? [r.value] : [])),
	failed: results.flatMap((r) => (r.isOk() ? [] : [r.error])),
});

export const batchAsync = <T>(res: (Result<T> | ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	ResultAsync.fromSafePromise(Promise.all(res).then(batch));

// `ok` is false whenever errors rode along, even with `data` present.
export type Response<T> = {
	ok: boolean;
	data: T | null;
	errors: RupeeError[];
};

export const fromResult = <T>(result: Result<T>): Response<T> =>
	result.match(
		(d) => ({ ok: true, data: d, errors: [] }),
		(err) => ({ ok: false, data: null, errors: [err] }),
	);

export const fromBatch = <T>(result: Result<Batch<T>>): Response<T[]> =>
	result.match(
		({ succeeded, failed }) => ({
			ok: failed.length === 0,
			data: succeeded,
			errors: failed,
		}),
		(err) => ({ ok: false, data: null, errors: [err] }),
	);
