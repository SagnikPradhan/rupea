import { sql } from 'kysely';
import type { Database } from './index';
import { provide, withContext } from '../shared/context/context';
import { unknownError, type RupeeError } from '../shared/result/error';
import { attempt, type ResultAsync } from '../shared/result/result';

const ROLLBACK = 'rolled back';

/**
 * Runs `f` in one database transaction, provided as `db`; a failed result rolls it back. Inside
 * another, it runs in a savepoint, so only its own writes roll back.
 */
export const atomically = <T>(f: () => ResultAsync<T>): ResultAsync<T> =>
	withContext()((context) =>
		attempt(
			() =>
				context.db.isTransaction
					? savepoint(context.db, () => unwrap(f))
					: context.db.transaction().execute((db) => provide({ ...context, db }, () => unwrap(f))),
			(t) => rolledBack(t) ?? unknownError(t),
		),
	);

const savepoint = async <T>(db: Database, run: () => Promise<T>): Promise<T> => {
	await sql`savepoint atomically`.execute(db);
	return run().then(
		(v) => sql`release savepoint atomically`.execute(db).then(() => v),
		async (t: unknown) => {
			await sql`rollback to savepoint atomically`.execute(db);
			await sql`release savepoint atomically`.execute(db);
			return Promise.reject(t);
		},
	);
};

/** Rejects with the error as cause, since Kysely rolls a transaction back only when its callback does. */
const unwrap = async <T>(f: () => ResultAsync<T>): Promise<T> => {
	const result = await f();
	return result.isOk()
		? result.value
		: Promise.reject(new Error(ROLLBACK, { cause: result.error }));
};

const rolledBack = (t: unknown) =>
	t instanceof Error && t.message === ROLLBACK ? (t.cause as RupeeError) : undefined;
