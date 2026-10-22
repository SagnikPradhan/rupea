import { fault, unknownError, type RupeeError } from '../shared/result/error';
import { attempt, type ResultAsync } from '../shared/result/result';

const UNIQUE_VIOLATION = '23505';

type DriverError = { code?: string; constraint?: string };

/** Like `attempt`, but a write that breaks a unique constraint fails with `UniqueViolation`. */
export const attemptWrite = <T>(f: () => PromiseLike<T>): ResultAsync<T> => attempt(f, fromDriver);

export const violates = (e: RupeeError, c: string): boolean =>
	e.type === 'UniqueViolation' && e.constraint === c;

const fromDriver = (thrown: unknown): RupeeError => {
	const driver = thrown as DriverError | undefined;
	if (driver?.code === UNIQUE_VIOLATION && driver.constraint)
		return fault('UniqueViolation', { constraint: driver.constraint });
	return unknownError(thrown);
};
