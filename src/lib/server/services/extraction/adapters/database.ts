import { statementGrids, statements } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import type { Contents } from '../domain/types';

export type StatementRow = { path: string; checksum: string; original: string | null };

const row = {
	path: statements.path,
	checksum: statements.checksum,
	original: statements.original,
};

export const findStatement = (ledger: string, path: string): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(row)
				.from(statements)
				.where(and(eq(statements.ledgerId, ledger), eq(statements.path, path)))
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const locateStatement = (
	ledger: string,
	checksum: string,
): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(row)
				.from(statements)
				.where(
					and(
						eq(statements.ledgerId, ledger),
						or(eq(statements.checksum, checksum), eq(statements.original, checksum)),
					),
				)
				.orderBy(statements.path)
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const saveStatement = (ledger: string, r: StatementRow): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insert(statements)
				.values({ ledgerId: ledger, ...r })
				.onConflictDoUpdate({
					target: [statements.ledgerId, statements.path],
					set: { checksum: r.checksum, original: r.original },
				});
		}),
	);

type GridKey = {
	checksum: string;
	reader: string;
};

export const findContents = (k: GridKey): ResultAsync<Contents | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ grid: statementGrids.grid, text: statementGrids.text })
				.from(statementGrids)
				.where(
					and(
						eq(statementGrids.checksum, k.checksum),
						eq(statementGrids.reader, k.reader),
						gt(statementGrids.expiresAt, sql`now()`),
					),
				)
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

type SaveContentsOptions = {
	checksum: string;
	reader: string;
	contents: Contents;
	expiresAt: Date;
};

// Saving is when expired contents are swept, as nothing else runs on a schedule.
export const saveContents = (o: SaveContentsOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.delete(statementGrids).where(lte(statementGrids.expiresAt, sql`now()`));
			const read = { ...o.contents, expiresAt: o.expiresAt };
			await db
				.insert(statementGrids)
				.values({ checksum: o.checksum, reader: o.reader, ...read })
				.onConflictDoUpdate({
					target: [statementGrids.checksum, statementGrids.reader],
					set: read,
				});
		}),
	);
