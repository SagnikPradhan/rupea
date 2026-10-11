import {
	accountType,
	DEFAULT_COMMODITY,
	print,
	type Amount,
	type RupeeTransaction,
} from '#services/ledger/application/shared.ts';
import { fallbackAccount, type Prediction } from '#services/prediction/domain/prediction.ts';
import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import type { RupeeRecord } from './types';

export type Draft = { key: string; content: string; failed: RupeeError[] };

type DraftOptions = {
	config: RupeeConfiguration;
	statement: string;
	account: string;
	records: RupeeRecord[];
	// One for each of `uncategorised(records)`, in order.
	predictions: Prediction[];
	failed: RupeeError[];
};

// A statement's own category counts only when it names a ledger account.
export const uncategorised = (l: RupeeRecord[]) => l.filter((r) => categoryAccount(r) === null);

export const draft = (options: DraftOptions): Draft => {
	const open = uncategorised(options.records);
	const predictions = new Map(open.map((r, i) => [r, options.predictions[i]] as const));
	return {
		key: `imports/${options.statement.replace(/\.[^.]*$/, '')}.rupee`,
		content: print(options.config, {
			metadata: { statement: [options.statement] },
			transactions: options.records.map(toTransaction(options.account, predictions)),
		}),
		failed: options.failed,
	};
};

const toTransaction =
	(account: string, predictions: Map<RupeeRecord, Prediction | undefined>) =>
	(record: RupeeRecord): RupeeTransaction => ({
		location: record.location,
		date: record.date,
		time: null,
		description: words(record.description).join(' '),
		metadata: {},
		postings: [
			{
				account,
				amount: record.amount,
				commodity: DEFAULT_COMMODITY,
				price: null,
				balance: record.balance,
				metadata: {},
			},
			{
				account:
					categoryAccount(record) ??
					predictions.get(record)?.account ??
					fallbackAccount(record.amount),
				amount: -record.amount as Amount,
				commodity: DEFAULT_COMMODITY,
				price: null,
				balance: null,
				metadata: {},
			},
		],
	});

const categoryAccount = (record: RupeeRecord): string | null => {
	if (!record.category) return null;

	const account = words(record.category).join('-');
	return accountType(account) ? account : null;
};

// A `.rupee` header is one line, and an account a single word.
const words = (t: string) => t.trim().split(/\s+/);
