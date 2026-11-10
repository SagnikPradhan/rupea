import { anyOf } from '#lib/server/db/expressions.ts';
import { literalLike } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SqlBool } from 'kysely';
import type { AccountNode } from '../domain/tree';

const SUGGESTIONS = 20;

/** Whether any of these accounts has no postings left. */
export const anyEmptied = (accounts: string[]): ResultAsync<boolean> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('accounts as a')
				.select('a.id')
				.where((e) => anyOf(e.ref('a.id'), accounts, 'uuid'))
				.where((e) =>
					e.not(e.exists(e.selectFrom('postings as o').whereRef('o.accountId', '=', 'a.id'))),
				)
				.limit(1)
				.executeTakeFirst(),
		).map((a) => a !== undefined),
	);

/**
 * Deletes the accounts no posting names any longer, neither them nor one under
 * them.
 */
export const deleteUnusedAccounts = (ledgerId: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.deleteFrom('accounts as a')
				.where('a.ledgerId', '=', ledgerId)
				.where((e) =>
					e.not(e.exists(e.selectFrom('postings as o').whereRef('o.accountId', '=', 'a.id'))),
				)
				.where((e) =>
					e.not(
						e.exists(
							e
								.selectFrom('accounts as b')
								.innerJoin('postings as p', 'p.accountId', 'b.id')
								.where('b.ledgerId', '=', ledgerId)
								.where(sql<SqlBool>`starts_with(lower(b.name), lower(a.name) || ':')`),
						),
					),
				)
				.execute();
		}),
	);

/** The first accounts whose names start with a prefix, in any case. */
export const listAccountNames = (ledgerId: string, prefix: string): ResultAsync<string[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('accounts')
				.select('name')
				.where('ledgerId', '=', ledgerId)
				.where(sql<SqlBool>`lower(name) like lower(${literalLike(prefix)}) || '%'`)
				.orderBy(sql`lower(name)`)
				.limit(SUGGESTIONS)
				.execute(),
		).map((n) => n.map((r) => r.name)),
	);

export const listAccountTree = (ledgerId: string): ResultAsync<AccountNode[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('accounts as a')
				.select((e) => [
					'a.id',
					'a.name',
					'a.type',
					'a.parentId',
					// Postgres scans all postings for an exists on an account that has none, as parents do;
					// ordering by date keeps it on the index, and only a subquery here keeps the ordering
					e(
						e
							.selectFrom('postings as p')
							.select(sql<boolean>`true`.as('posted'))
							.whereRef('p.accountId', '=', 'a.id')
							.orderBy('p.date')
							.limit(1),
						'is not',
						null,
					)
						.$castTo<boolean>()
						.as('posted'),
				])
				.where('a.ledgerId', '=', ledgerId)
				.orderBy('a.name')
				.execute(),
		),
	);
