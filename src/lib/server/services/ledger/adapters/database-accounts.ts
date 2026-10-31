import { literalLike } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SqlBool } from 'kysely';
import type { AccountNode } from '../domain/tree';

const SUGGESTIONS = 20;

/** Deletes the accounts no posting names any longer, neither them nor one under them. */
export const deleteUnusedAccounts = (ledgerId: string): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.deleteFrom('accounts as a')
				.where('a.ledgerId', '=', ledgerId)
				.where((e) =>
					e.not(
						e.exists(
							e
								.selectFrom('accounts as b')
								.innerJoin('postings as p', 'p.accountId', 'b.id')
								.where('b.ledgerId', '=', ledgerId)
								.where(
									sql<SqlBool>`(b.id = a.id or starts_with(lower(b.name), lower(a.name) || ':'))`,
								),
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
					e
						.exists(e.selectFrom('postings as p').whereRef('p.accountId', '=', 'a.id'))
						.$castTo<boolean>()
						.as('posted'),
				])
				.where('a.ledgerId', '=', ledgerId)
				.orderBy('a.name')
				.execute(),
		),
	);
