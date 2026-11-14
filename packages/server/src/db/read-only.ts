import { provide, withContext } from '../shared/context/context';
import { attempt, type Result, type ResultAsync } from '../shared/result/result';
import type { Database } from './index';

/**
 * Runs `run` in one read-only transaction, so every read in it sees the same
 * snapshot, or in the one already open.
 */
export const readOnly = <T>(run: (db: Database) => Promise<T>): ResultAsync<T> =>
	withContext('db')((db) =>
		attempt(() =>
			db.isTransaction
				? run(db)
				: db
						.transaction()
						.setAccessMode('read only')
						.setIsolationLevel('repeatable read')
						.execute(run),
		),
	);

/**
 * Runs `f` with one read-only transaction provided as `db`, so every read in it
 * sees the same snapshot, or in the one already open.
 */
export const consistently = <T>(f: () => ResultAsync<T>): ResultAsync<T> =>
	withContext()((context) =>
		context.db.isTransaction
			? f()
			: attempt<Result<T>>(() =>
					context.db
						.transaction()
						.setAccessMode('read only')
						.setIsolationLevel('repeatable read')
						.execute((db) => provide({ ...context, db }, async () => f())),
				).andThen((r) => r),
	);
