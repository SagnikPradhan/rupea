import { replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { viewTransaction } from '#services/ledger/application/shared.ts';
import { query } from '$app/server';
import { Handle, inLedger } from './shared';

const view = ({ id, counted, ...transaction }: Ledger.CountedTransaction) => ({
	id,
	counted,
	...viewTransaction(transaction),
});

export const getTransactions = query(Handle, async (h) => {
	const transactions = inLedger({ handle: h, action: Ledger.getTransactions });
	return replyFromBatch(
		await transactions.map((batch) => ({
			...batch,
			succeeded: batch.succeeded.map(view).toReversed(),
		})),
	);
});
