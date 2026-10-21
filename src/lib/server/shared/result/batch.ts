import type { RupeeError } from './error';
import { ResultAsync, sequence, type Result } from './result';

export type Batch<T> = { succeeded: T[]; failed: RupeeError[] };

export const batch = <T>(results: Result<T>[]): Batch<T> => ({
	succeeded: results.flatMap((r) => (r.isOk() ? [r.value] : [])),
	failed: results.flatMap((r) => (r.isOk() ? [] : [r.error])),
});

export const batchAsync = <T>(res: (Result<T> | ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	ResultAsync.fromSafePromise(Promise.all(res).then(batch));

/** Like `batchAsync`, starting each step once the one before it is done. */
export const batchInOrder = <T>(steps: (() => ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	sequence(
		steps.map(
			(s) => () => ResultAsync.fromSafePromise<Result<T>[]>(Promise.resolve(s()).then((r) => [r])),
		),
	).map((r) => batch(r));
