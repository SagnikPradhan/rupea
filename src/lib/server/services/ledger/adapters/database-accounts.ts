import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';

/** Rebuilds a ledger's accounts from its postings, naming each by the first of its spellings. */
export const saveAccounts = (ledgerId: string): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				await tx.deleteFrom('accounts').where('ledgerId', '=', ledgerId).execute();
				await tx
					.insertInto('accounts')
					.columns(['ledgerId', 'name', 'type'])
					.expression(
						tx
							.selectFrom('postings as p')
							.select((e) => ['p.ledgerId', e.fn.min('p.account').as('name'), 'p.accountType'])
							.where('p.ledgerId', '=', ledgerId)
							.groupBy(['p.ledgerId', sql`lower(${sql.ref('p.account')})`, 'p.accountType']),
					)
					.execute();
			}),
		),
	);

export const listAccountNames = (ledgerId: string): ResultAsync<string[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('accounts')
				.select('name')
				.where('ledgerId', '=', ledgerId)
				.orderBy('name')
				.execute(),
		).map((r) => r.map((a) => a.name)),
	);
