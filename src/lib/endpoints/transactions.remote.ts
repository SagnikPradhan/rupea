import { fromBatch } from '#lib/server/shared/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { query } from '$app/server';
import { Handle, inLedger, viewTransaction } from './shared';

const view = ({ id, counted, ...transaction }: Ledger.CountedTransaction) => ({
	id,
	counted,
	...viewTransaction(transaction),
});

export const getTransactions = query(Handle, async (h) => {
	const transactions = inLedger({ handle: h, action: Ledger.getTransactions });
	return fromBatch(
		await transactions.map((batch) => ({
			...batch,
			succeeded: batch.succeeded.map(view),
		})),
	);
});
