import { sql } from 'kysely';
import type { Database } from './index';
import { provide, withContext } from '../shared/context/context';
import { unknownError, type RupeeError } from '../shared/result/error';
import { attempt, type ResultAsync } from '../shared/result/result';

type Rollback = { rollback: RupeeError };

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
			(t) => (isRollback(t) ? t.rollback : unknownError(t)),
		),
	);

const savepoint = async <T>(db: Database, run: () => Promise<T>): Promise<T> => {
	await sql`savepoint atomically`.execute(db);
	return run().then(
		(v) => sql`release savepoint atomically`.execute(db).then(() => v),
		(t: unknown) => sql`rollback to savepoint atomically`.execute(db).then(() => Promise.reject(t)),
	);
};

/** Rejects with the error, since Kysely rolls a transaction back only when its callback does. */
const unwrap = async <T>(f: () => ResultAsync<T>): Promise<T> => {
	const result = await f();
	return result.isOk()
		? result.value
		: Promise.reject({ rollback: result.error } satisfies Rollback);
};

const isRollback = (t: unknown): t is Rollback =>
	typeof t === 'object' && t !== null && 'rollback' in t;
