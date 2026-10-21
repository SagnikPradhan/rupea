import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { IMPORTS } from '#lib/shared/folders.ts';
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
export type CategorisedRupeeRecord = RupeeRecord & { account: string };

type Source = {
	key: string;
	checksum: string;
	/** The upload's, set when unlocking it changed the content. */
	originalChecksum: string | null;
};

type DraftOptions = {
	config: LedgerConfiguration;
	statement: Source;
	account: string;
	// In any order; they are written in the statement's.
	records: CategorisedRupeeRecord[];
	failed: RupeeError[];
};

// A statement's own category counts only when it names a ledger account.
export const uncategorised = (l: RupeeRecord[]) => l.filter((r) => categoryAccount(r) === null);

export const categorised = (records: RupeeRecord[]): CategorisedRupeeRecord[] =>
	records.flatMap((r) => {
		const account = categoryAccount(r);
		return account ? [{ ...r, account }] : [];
	});

export const draft = (options: DraftOptions): Draft => ({
	key: draftKey(options.statement),
	content: print(options.config, {
		metadata: sourceMetadata(options.statement),
		transactions: options.records
			.toSorted((a, b) => a.location.line - b.location.line)
			.map(toTransaction(options.account)),
		prices: [],
	}),
	failed: options.failed,
});

type CopyOptions = {
	config: LedgerConfiguration;
	statement: Source;
	text: string[];
};

/** An uploaded ledger file as written, below the metadata of where it came from. */
export const copy = ({ config, statement, text }: CopyOptions): Draft => ({
	key: draftKey(statement),
	content:
		print(config, { metadata: sourceMetadata(statement), transactions: [], prices: [] }) +
		text.join('\n'),
	failed: [],
});

const draftKey = (s: Source) => `${IMPORTS}/${s.key.replace(/\.[^.]*$/, '')}.rupee`;

// The checksum finds the statement wherever it has moved; the path is only what it was called.
const sourceMetadata = (statement: Source) => ({
	statement: [statement.key],
	checksum: [statement.checksum],
	...(statement.originalChecksum ? { 'original-checksum': [statement.originalChecksum] } : {}),
});

const toTransaction =
	(account: string) =>
	(record: CategorisedRupeeRecord): RupeeTransaction => ({
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
				cost: null,
				balance: record.balance,
				metadata: {},
			},
			{
				account: record.account,
				amount: -record.amount as Amount,
				commodity: DEFAULT_COMMODITY,
				price: null,
				cost: null,
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
