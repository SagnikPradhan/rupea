import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { BudgetLine } from '../domain/budgets';

/** The lines every B line of a ledger sets, in the order they are written. */
export const listBudgetLines = (ledgerId: string): ResultAsync<BudgetLine[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('budgetLines as b')
				.innerJoin('ledgerFiles as f', 'f.id', 'b.fileId')
				.select(['b.account', 'b.since', 'b.keys', 'f.key as file', 'b.line'])
				.where('b.ledgerId', '=', ledgerId)
				.orderBy('f.key')
				.orderBy('b.line')
				.execute(),
		),
	);
