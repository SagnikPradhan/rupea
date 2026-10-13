import { statementGrids, statements } from '#lib/server/db/schema.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Grid } from '../domain/types';

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
				.where(and(eq(statements.ledgerId, ledger), eq(statements.checksum, checksum)))
				.orderBy(statements.path)
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const listStatements = (l: string): ResultAsync<StatementRow[]> =>
	withContext('db')((db) =>
		attempt(() => db.select(row).from(statements).where(eq(statements.ledgerId, l))),
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

type MoveStatementOptions = {
	ledger: string;
	from: string;
	to: string;
};

export const moveStatement = (o: MoveStatementOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.update(statements)
				.set({ path: o.to })
				.where(and(eq(statements.ledgerId, o.ledger), eq(statements.path, o.from)));
		}),
	);

export const replaceStatements = (ledger: string, rows: StatementRow[]): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				await tx.delete(statements).where(eq(statements.ledgerId, ledger));
				if (rows.length > 0)
					await tx.insert(statements).values(rows.map((r) => ({ ledgerId: ledger, ...r })));
			}),
		),
	);

type GridKey = {
	checksum: string;
	reader: string;
};

export const findGrid = (k: GridKey): ResultAsync<Grid | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ grid: statementGrids.grid })
				.from(statementGrids)
				.where(
					and(
						eq(statementGrids.checksum, k.checksum),
						eq(statementGrids.reader, k.reader),
						gt(statementGrids.expiresAt, sql`now()`),
					),
				)
				.limit(1)
				.then(([f]) => f?.grid ?? null),
		),
	);

type SaveGridOptions = {
	checksum: string;
	reader: string;
	grid: Grid;
	expiresAt: Date;
};

// Saving is when expired grids are swept, as nothing else runs on a schedule.
export const saveGrid = (o: SaveGridOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.delete(statementGrids).where(lte(statementGrids.expiresAt, sql`now()`));
			await db
				.insert(statementGrids)
				.values(o)
				.onConflictDoUpdate({
					target: [statementGrids.checksum, statementGrids.reader],
					set: { grid: o.grid, expiresAt: o.expiresAt },
				});
		}),
	);
