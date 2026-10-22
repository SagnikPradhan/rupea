import { fault, unknownError, type RupeeError } from '../shared/result/error';
import { attempt, type ResultAsync } from '../shared/result/result';

const UNIQUE_VIOLATION = '23505';

type DriverError = Error & { code?: string; constraint?: string };

/** Like `attempt`, but a write that breaks a unique constraint fails with `UniqueViolation`. */
export const attemptWrite = <T>(f: () => PromiseLike<T>): ResultAsync<T> => attempt(f, fromDriver);

export const violates = (e: RupeeError, c: string): boolean =>
	e.type === 'UniqueViolation' && e.constraint === c;

/** Reads the driver's error, which Drizzle keeps as the cause. */
const fromDriver = (thrown: unknown): RupeeError => {
	const cause: DriverError | undefined =
		thrown instanceof Error && thrown.cause instanceof Error ? thrown.cause : undefined;
	if (cause?.code === UNIQUE_VIOLATION && cause.constraint)
		return fault('UniqueViolation', { constraint: cause.constraint });
	return unknownError(thrown);
};
