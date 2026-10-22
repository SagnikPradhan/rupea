import { withContext } from '../shared/context/context';
import { attempt, type ResultAsync } from '../shared/result/result';
import type { Database } from './index';

/** Runs `run` in one read-only transaction, so every read in it sees the same snapshot. */
export const readOnly = <T>(run: (db: Database) => Promise<T>): ResultAsync<T> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction((t) => run(t), {
				isolationLevel: 'repeatable read',
				accessMode: 'read only',
			}),
		),
	);
