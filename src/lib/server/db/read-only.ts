import { withContext } from '../shared/context/context';
import { attempt, type ResultAsync } from '../shared/result/result';
import type { Queries } from './index';

/** Runs `run` in one read-only transaction, so every read in it sees the same snapshot. */
export const readOnly = <T>(run: (kysely: Queries) => Promise<T>): ResultAsync<T> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.transaction()
				.setAccessMode('read only')
				.setIsolationLevel('repeatable read')
				.execute(run),
		),
	);
