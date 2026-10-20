import type { Batch } from '#lib/server/shared/result/batch.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import { index, type IndexedTransaction } from '../adapters/database';
import { counted } from '../domain/events';
import type { Ledger } from '../domain/types';
import { checkBalances, syncIndex } from './sync';

export type CountedTransaction = IndexedTransaction & { counted: boolean };

export const getTransactions = (l: Ledger): ResultAsync<Batch<CountedTransaction>> =>
	syncIndex(l).andThen((f) =>
		listCounted(l.id).map((b) => ({ ...b, failed: [...f, ...b.failed] })),
	);

// Evidence is kept but not counted.
const listCounted = (ledgerId: string): ResultAsync<Batch<CountedTransaction>> =>
	index(ledgerId)
		.transactions()
		.map(counted)
		.andThen((c) =>
			checkBalances(ledgerId, c.uncounted).map((b) => ({
				succeeded: c.transactions,
				failed: [...c.failed, ...b],
			})),
		);
