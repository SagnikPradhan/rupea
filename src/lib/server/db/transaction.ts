import type { Database } from './index';

/** Runs `f` in a transaction of its own, or in the one `db` already has open. */
export const transaction = <T>(db: Database, f: (tx: Database) => Promise<T>): Promise<T> =>
	db.isTransaction ? f(db) : db.transaction().execute(f);
