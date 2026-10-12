import * as neverthrow from 'neverthrow';
import { type RupeeError, unknownError } from './error';

export type Result<T> = neverthrow.Result<T, RupeeError>;
export type ResultAsync<T> = neverthrow.ResultAsync<T, RupeeError>;
export const ResultAsync = neverthrow.ResultAsync;

export { ok, okAsync } from 'neverthrow';

// Typed as RupeeError up front so branches unify without annotations.
export const err = (e: RupeeError): neverthrow.Err<never, RupeeError> => neverthrow.err(e);
export const errAsync = (e: RupeeError): ResultAsync<never> => neverthrow.errAsync(e);

export const attempt = <T>(f: () => PromiseLike<T>): ResultAsync<T> =>
	attemptWith({ try: f, catch: unknownError });

export type Attempt<T> = {
	try: () => PromiseLike<T>;
	catch: (thrown: unknown) => RupeeError;
};

export const attemptWith = <T>(a: Attempt<T>): ResultAsync<T> =>
	ResultAsync.fromThrowable(async () => a.try(), a.catch)();

export const sequence = <T>(steps: (() => ResultAsync<T[]>)[]): ResultAsync<T[]> =>
	steps.reduce<ResultAsync<T[]>>(
		(d, s) => d.andThen((p) => s().map((n) => [...p, ...n])),
		neverthrow.okAsync([]),
	);
