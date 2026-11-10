import type { InsertObject } from 'kysely';
import { ROWS_PER_STATEMENT, type Database } from './index';
import type { Tables } from './tables';
import { chunks } from '../shared/arrays';

/** Inserts any number of rows, a chunk per statement. */
export const insertAll = async <T extends keyof Tables>(
	db: Database,
	table: T,
	rows: InsertObject<Tables, T>[],
) => {
	for (const chunk of chunks(rows, ROWS_PER_STATEMENT))
		await db.insertInto(table).values(chunk).execute(); // NOSONAR -- a transaction's statements share one connection, so they run in turn
};
