import * as neverthrow from 'neverthrow';
import { type RupeaError, unknownError } from './error';

export type Result<T> = neverthrow.Result<T, RupeaError>;
export type ResultAsync<T> = neverthrow.ResultAsync<T, RupeaError>;
export const ResultAsync = neverthrow.ResultAsync;

export { ok, okAsync } from 'neverthrow';

// Typed as RupeaError up front so branches unify without annotations.
export const err = (e: RupeaError): neverthrow.Err<never, RupeaError> => neverthrow.err(e);
export const errAsync = (e: RupeaError): ResultAsync<never> => neverthrow.errAsync(e);

/** Runs an effect that may throw or reject, failing with what `onThrow` makes of it. */
export const attempt = <T>(
	f: () => T | PromiseLike<T>,
	onThrow: (thrown: unknown) => RupeaError = unknownError,
): ResultAsync<T> => ResultAsync.fromThrowable(async () => f(), onThrow)();

/** Runs each step once the one before it succeeded, stopping at the first to fail. */
export const inOrder = <T>(steps: (() => ResultAsync<T>)[]): ResultAsync<T[]> =>
	steps.reduce<ResultAsync<T[]>>(
		(r, s) => r.andThen((d) => s().map((n) => [...d, n])),
		neverthrow.okAsync([]),
	);
