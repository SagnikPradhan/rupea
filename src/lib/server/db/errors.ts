const UNIQUE_VIOLATION = '23505';

type DriverError = Error & { code?: string; constraint?: string };

// Drizzle keeps the driver's error as the cause.
export const violatesUnique = (thrown: unknown, constraint: string): boolean => {
	if (!(thrown instanceof Error) || !(thrown.cause instanceof Error)) return false;

	const cause: DriverError = thrown.cause;
	return cause.code === UNIQUE_VIOLATION && cause.constraint === constraint;
};
