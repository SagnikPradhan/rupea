import type { RupeeError } from './error';
import { ResultAsync, type Result } from './result';

export type Batch<T> = { succeeded: T[]; failed: RupeeError[] };

export const batch = <T>(results: Result<T>[]): Batch<T> => ({
	succeeded: results.flatMap((r) => (r.isOk() ? [r.value] : [])),
	failed: results.flatMap((r) => (r.isOk() ? [] : [r.error])),
});

/** Runs every step at once, keeping what failed beside what succeeded. */
export const batchAsync = <T>(res: (Result<T> | ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	ResultAsync.fromSafePromise(Promise.all(res).then(batch));

/** Like `batchAsync`, starting each step once the one before it is done. */
export const batchInOrder = <T>(s: (() => ResultAsync<T>)[]): ResultAsync<Batch<T>> =>
	ResultAsync.fromSafePromise(settleEach(s).then(batch));

const settleEach = async <T>(steps: (() => ResultAsync<T>)[]) => {
	const results: Result<T>[] = [];
	for (const step of steps) results.push(await step());
	return results;
};
