import { statementGrids } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Grid } from '../domain/types';

type FindGridOptions = {
	user: string;
	statement: string;
	reader: string;
};

export const findGrid = (
	o: FindGridOptions,
): ResultAsync<{ checksum: string; grid: Grid } | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ checksum: statementGrids.checksum, grid: statementGrids.grid })
				.from(statementGrids)
				.where(
					and(
						eq(statementGrids.userId, o.user),
						eq(statementGrids.statement, o.statement),
						eq(statementGrids.reader, o.reader),
						gt(statementGrids.expiresAt, sql`now()`),
					),
				)
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

type SaveGridOptions = {
	user: string;
	statement: string;
	reader: string;
	checksum: string;
	grid: Grid;
	expiresAt: Date;
};

// Saving is when expired grids are swept, as nothing else runs on a schedule.
export const saveGrid = (o: SaveGridOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const { user, statement, ...cached } = o;
			await db.delete(statementGrids).where(lte(statementGrids.expiresAt, sql`now()`));
			await db
				.insert(statementGrids)
				.values({ userId: user, statement, ...cached })
				.onConflictDoUpdate({
					target: [statementGrids.userId, statementGrids.statement],
					set: cached,
				});
		}),
	);
