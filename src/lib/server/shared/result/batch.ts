import type { RupeeError } from './error';
import { ResultAsync, type Result } from './result';

export type Batch<T> = { succeeded: T[]; failed: RupeeError[] };

export const batch = <T>(results: Result<T>[]): Batch<T> => ({
	succeeded: results.flatMap((r) => (r.isOk() ? [r.value] : [])),
	failed: results.flatMap((r) => (r.isOk() ? [] : [r.error])),
});

export const batchAsync = <T>(res: (Result<T> | ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	ResultAsync.fromSafePromise(Promise.all(res).then(batch));
