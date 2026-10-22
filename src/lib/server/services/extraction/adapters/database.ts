import { anyOf, json } from '#lib/server/db/expressions.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import type { Contents } from '../domain/types';

export type StatementRow = { key: string; checksum: string; originalChecksum: string | null };

const row = ['key', 'checksum', 'originalChecksum'] as const;

export const findStatement = (ledgerId: string, key: string): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('statements')
				.select(row)
				.where('ledgerId', '=', ledgerId)
				.where('key', '=', key)
				.executeTakeFirst()
				.then((f) => f ?? null),
		),
	);

export const findStatementByChecksum = (
	ledgerId: string,
	checksum: string,
): ResultAsync<StatementRow | null> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('statements')
				.select(row)
				.where('ledgerId', '=', ledgerId)
				.where((e) => e.or([e('checksum', '=', checksum), e('originalChecksum', '=', checksum)]))
				.orderBy('key')
				.limit(1)
				.executeTakeFirst()
				.then((f) => f ?? null),
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
				.selectFrom('statements')
				.select(row)
				.where('ledgerId', '=', ledgerId)
				.orderBy('createdAt', 'desc')
				.limit(limit)
				.execute(),
		),
	);

export const saveStatement = (ledgerId: string, r: StatementRow): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insertInto('statements')
				.values({ ledgerId, ...r })
				.onConflict((o) =>
					o
						.columns(['ledgerId', 'key'])
						.doUpdateSet({ checksum: r.checksum, originalChecksum: r.originalChecksum }),
				)
				.execute();
		}),
	);

/** Drops rows whose file is gone, as the folder, not the table, is the truth. */
export const deleteStatements = (ledgerId: string, keys: string[]): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.deleteFrom('statements')
				.where('ledgerId', '=', ledgerId)
				.where((e) => anyOf(e.ref('key'), keys, 'text'))
				.execute();
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
				.selectFrom('statementContents')
				.select(['grid', 'text'])
				.where('checksum', '=', k.checksum)
				.where('reader', '=', k.reader)
				.where('expiresAt', '>', sql<Date>`now()`)
				.executeTakeFirst()
				.then((f) => f ?? null),
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
			await db
				.deleteFrom('statementContents')
				.where('expiresAt', '<=', sql<Date>`now()`)
				.execute();
			const read = {
				grid: json(o.contents.grid),
				text: json(o.contents.text),
				expiresAt: o.expiresAt,
			};
			await db
				.insertInto('statementContents')
				.values({ checksum: o.checksum, reader: o.reader, ...read })
				.onConflict((c) => c.columns(['checksum', 'reader']).doUpdateSet(read))
				.execute();
		}),
	);
