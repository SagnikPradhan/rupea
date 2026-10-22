import { anyOf } from '#lib/server/db/expressions.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';

/** Sums the counted postings of each commodity by account and day again. */
export const rebalance = (ledgerId: string, commodities: string[]): ResultAsync<void> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely.transaction().execute(async (tx) => {
				await tx
					.deleteFrom('deltas')
					.where('ledgerId', '=', ledgerId)
					.where(anyOf('commodity', commodities, 'text'))
					.execute();
				await tx
					.insertInto('deltas')
					.columns(['ledgerId', 'account', 'accountType', 'commodity', 'date', 'amount'])
					.expression(
						tx
							.selectFrom('postings as p')
							.innerJoin('transactions as t', 't.id', 'p.transactionId')
							.select([
								'p.ledgerId',
								'p.account',
								'p.accountType',
								'p.commodity',
								't.date',
								sql<bigint>`sum(${sql.ref('p.amount')})`.as('amount'),
							])
							.where('p.ledgerId', '=', ledgerId)
							.where(anyOf('p.commodity', commodities, 'text'))
							.where('t.counted', '=', true)
							.groupBy(['p.ledgerId', 'p.account', 'p.accountType', 'p.commodity', 't.date']),
					)
					.execute();
			}),
		),
	);
