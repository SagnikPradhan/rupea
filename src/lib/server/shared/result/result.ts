import * as neverthrow from 'neverthrow';
import { type RupeeError, unknownError } from './error';

export type Result<T> = neverthrow.Result<T, RupeeError>;
export type ResultAsync<T> = neverthrow.ResultAsync<T, RupeeError>;
export const ResultAsync = neverthrow.ResultAsync;

export { ok, okAsync } from 'neverthrow';

// Typed as RupeeError up front so branches unify without annotations.
export const err = (e: RupeeError): neverthrow.Err<never, RupeeError> => neverthrow.err(e);
export const errAsync = (e: RupeeError): ResultAsync<never> => neverthrow.errAsync(e);

/** Runs an effect that may throw or reject, failing with what `onThrow` makes of it. */
export const attempt = <T>(
	f: () => T | PromiseLike<T>,
	onThrow: (thrown: unknown) => RupeeError = unknownError,
): ResultAsync<T> => ResultAsync.fromThrowable(async () => f(), onThrow)();

/** Runs each step once the one before it succeeded, stopping at the first to fail. */
export const inOrder = <T>(steps: (() => ResultAsync<T>)[]): ResultAsync<T[]> =>
	steps.reduce<ResultAsync<T[]>>(
		(r, s) => r.andThen((d) => s().map((n) => [...d, n])),
		neverthrow.okAsync([]),
	);
