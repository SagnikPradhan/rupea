import type { Amount, RupeeTransaction } from '#lib/server/services/ledger/domain/types.ts';
import { predictAccount } from '#lib/server/services/prediction/domain/prediction.ts';
import type { RupeeRecord } from './types';

/**
 * A record as a transaction of the statement's own `account`: the amount
 * lands there, and the other side, its negation, goes to the record's
 * category or else a predicted account.
 */
export const toTransaction =
	(account: string) =>
	(record: RupeeRecord): RupeeTransaction => ({
		location: record.location,
		date: record.date,
		time: null,
		description: words(record.description).join(' '),
		postings: [
			{ account, amount: record.amount },
			{
				account: record.category ? words(record.category).join('-') : predictAccount(record),
				amount: -record.amount as Amount,
			},
		],
	});

/** A `.rupee` header is one line, and an account a single word. */
const words = (t: string) => t.trim().split(/\s+/);
