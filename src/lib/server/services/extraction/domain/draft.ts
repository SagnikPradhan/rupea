import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import {
	accountType,
	DEFAULT_COMMODITY,
	print,
	type Amount,
	type RupeeTransaction,
} from '#services/ledger/application/shared.ts';
import type { RupeeRecord } from './types';

export type Draft = { key: string; content: string; failed: RupeeError[] };

// A record with the account its money came from or went to.
export type Categorised = RupeeRecord & { account: string };

type DraftOptions = {
	config: RupeeConfiguration;
	statement: string;
	account: string;
	// In any order; they are written in the statement's.
	records: Categorised[];
	failed: RupeeError[];
};

// A statement's own category counts only when it names a ledger account.
export const uncategorised = (l: RupeeRecord[]) => l.filter((r) => categoryAccount(r) === null);

export const categorised = (records: RupeeRecord[]): Categorised[] =>
	records.flatMap((r) => {
		const account = categoryAccount(r);
		return account ? [{ ...r, account }] : [];
	});

export const draft = (options: DraftOptions): Draft => ({
	key: `imports/${options.statement.replace(/\.[^.]*$/, '')}.rupee`,
	content: print(options.config, {
		metadata: { statement: [options.statement] },
		transactions: options.records
			.toSorted((a, b) => a.location.line - b.location.line)
			.map(toTransaction(options.account)),
	}),
	failed: options.failed,
});

const toTransaction =
	(account: string) =>
	(record: Categorised): RupeeTransaction => ({
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
				account: record.account,
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
