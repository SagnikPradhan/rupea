import { DatabaseError } from 'pg';
import { fault, unknownError, type RupeaError } from '../shared/result/error';
import { attempt, type ResultAsync } from '../shared/result/result';

const UNIQUE_VIOLATION = '23505';

/** Like `attempt`, but a write that breaks a unique constraint fails with `UniqueViolation`. */
export const attemptWrite = <T>(f: () => PromiseLike<T>): ResultAsync<T> => attempt(f, fromDriver);

export const violates = (e: RupeaError, c: string): boolean =>
	e.type === 'UniqueViolation' && e.constraint === c;

const fromDriver = (thrown: unknown): RupeaError => {
	if (thrown instanceof DatabaseError && thrown.code === UNIQUE_VIOLATION && thrown.constraint)
		return fault('UniqueViolation', { constraint: thrown.constraint });
	return unknownError(thrown);
};
