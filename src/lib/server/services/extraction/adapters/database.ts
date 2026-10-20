import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import { statementContents, statements } from './database-schema';
import type { Contents } from '../domain/types';

export type StatementRow = { key: string; checksum: string; originalChecksum: string | null };

const row = {
	key: statements.key,
	checksum: statements.checksum,
	originalChecksum: statements.originalChecksum,
};

export const findStatementByKey = (ledger: string, key: string): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select(row)
				.from(statements)
				.where(and(eq(statements.ledgerId, ledger), eq(statements.key, key)))
				.limit(1)
				.then(([f]) => f ?? null),
		),
	);

export const findStatementByChecksum = (
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
						or(eq(statements.checksum, checksum), eq(statements.originalChecksum, checksum)),
					),
				)
				.orderBy(statements.key)
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
					target: [statements.ledgerId, statements.key],
					set: { checksum: r.checksum, originalChecksum: r.originalChecksum },
				});
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
