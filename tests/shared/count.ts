import { sql, type SelectQueryBuilder } from 'kysely';

/** How many rows a query finds. */
export const count = <D, T extends keyof D>(query: SelectQueryBuilder<D, T, object>) =>
	query
		.select(sql<string>`count(*)`.as('count'))
		.$castTo<{ count: string }>()
		.executeTakeFirstOrThrow()
		.then((r) => Number(r.count));
