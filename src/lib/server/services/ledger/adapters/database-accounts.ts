import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SqlBool } from 'kysely';
import type { AccountNode } from '../domain/tree';

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
