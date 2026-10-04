/** Inbound adapter for the ledger's transactions. */
import { query } from '$app/server';
import * as Auth from '#lib/server/services/auth/application/auth.ts';
import * as Ledger from '#lib/server/services/ledger/application/ledger.ts';
import { fromBatch } from '#lib/server/shared/result.ts';
import { viewTransaction } from './shared';

const view = ({ id, ...transaction }: Ledger.IndexedTransaction) => ({
	id,
	...viewTransaction(transaction),
});

export const getTransactions = query(async () => {
	const transactions = Auth.withCurrentUser(({ id }) => Ledger.getTransactions(id));
	return fromBatch(
		await transactions.map((batch) => ({
			...batch,
			succeeded: batch.succeeded.map(view),
		})),
	);
});
