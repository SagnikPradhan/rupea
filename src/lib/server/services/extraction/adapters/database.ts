import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { statementContents, statements } from './database-schema';
import type { Contents } from '../domain/types';

export type StatementRow = { key: string; checksum: string; originalChecksum: string | null };

const row = {
	key: statements.key,
	checksum: statements.checksum,
	originalChecksum: statements.originalChecksum,
};

export const findStatement = (ledgerId: string, key: string): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(row)
				.from(statements)
				.where(and(eq(statements.ledgerId, ledgerId), eq(statements.key, key)))
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const findStatementByChecksum = (
	ledgerId: string,
	checksum: string,
): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(row)
				.from(statements)
				.where(
					and(
						eq(statements.ledgerId, ledgerId),
						or(eq(statements.checksum, checksum), eq(statements.originalChecksum, checksum)),
					),
				)
				.orderBy(statements.key)
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

/** A ledger's latest statements, newest first. */
export const listRecentStatements = (
	ledgerId: string,
	limit: number,
): ResultAsync<StatementRow[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(row)
				.from(statements)
				.where(eq(statements.ledgerId, ledgerId))
				.orderBy(desc(statements.createdAt))
				.limit(limit),
		),
	);

export const saveStatement = (ledgerId: string, r: StatementRow): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insert(statements)
				.values({ ledgerId, ...r })
				.onConflictDoUpdate({
					target: [statements.ledgerId, statements.key],
					set: { checksum: r.checksum, originalChecksum: r.originalChecksum },
				});
		}),
	);

/** Drops rows whose file is gone, as the folder, not the table, is the truth. */
export const deleteStatements = (ledgerId: string, keys: string[]): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			if (keys.length === 0) return;

			await db
				.delete(statements)
				.where(and(eq(statements.ledgerId, ledgerId), inArray(statements.key, keys)));
		}),
	);

type StatementContentsKey = {
	checksum: string;
	reader: string;
};

export const findStatementContents = (k: StatementContentsKey): ResultAsync<Contents | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({ grid: statementContents.grid, text: statementContents.text })
				.from(statementContents)
				.where(
					and(
						eq(statementContents.checksum, k.checksum),
						eq(statementContents.reader, k.reader),
						gt(statementContents.expiresAt, sql`now()`),
					),
				)
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

type SaveStatementContentsOptions = {
	checksum: string;
	reader: string;
	contents: Contents;
	expiresAt: Date;
};

// Saving is when expired contents are swept, as nothing else runs on a schedule.
export const saveStatementContents = (o: SaveStatementContentsOptions): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.delete(statementContents).where(lte(statementContents.expiresAt, sql`now()`));
			const read = { ...o.contents, expiresAt: o.expiresAt };
			await db
				.insert(statementContents)
				.values({ checksum: o.checksum, reader: o.reader, ...read })
				.onConflictDoUpdate({
					target: [statementContents.checksum, statementContents.reader],
					set: read,
				});
		}),
	);
