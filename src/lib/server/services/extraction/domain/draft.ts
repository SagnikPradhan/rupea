import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import { IMPORTS } from '#lib/shared/folders.ts';
import {
	accountType,
	DEFAULT_COMMODITY,
	print,
	toNode,
	type Amount,
	type RupeaTransaction,
} from '#services/ledger/application/shared.ts';
import type { RupeaRecord } from './types';

export type Draft = { key: string; content: string; failed: RupeaError[] };

// A record with the account its money came from or went to.
export type CategorisedRupeaRecord = RupeaRecord & { account: string };

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
	records: CategorisedRupeaRecord[];
	failed: RupeaError[];
};

// A statement's own category counts only when it names a ledger account.
export const uncategorised = (l: RupeaRecord[]) => l.filter((r) => categoryAccount(r) === null);

export const categorised = (records: RupeaRecord[]): CategorisedRupeaRecord[] =>
	records.flatMap((r) => {
		const account = categoryAccount(r);
		return account ? [{ ...r, account }] : [];
	});

export const draft = (options: DraftOptions): Draft => ({
	key: draftKey(options.statement),
	content: print(
		options.config,
		toNode({
			metadata: sourceMetadata(options.statement),
			transactions: options.records
				.toSorted((a, b) => a.location.line - b.location.line)
				.map(toTransaction(options.account)),
			prices: [],
			links: [],
		}),
	),
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
		print(
			config,
			toNode({ metadata: sourceMetadata(statement), transactions: [], prices: [], links: [] }),
		) + text.join('\n'),
	failed: [],
});

const draftKey = (s: Source) => `${IMPORTS}/${s.key.replace(/\.[^.]*$/, '')}.rupea`;

// The checksum finds the statement wherever it has moved; the path is only what it was called.
const sourceMetadata = (statement: Source) => ({
	statement: [statement.key],
	checksum: [statement.checksum],
	...(statement.originalChecksum ? { 'original-checksum': [statement.originalChecksum] } : {}),
});

const toTransaction =
	(account: string) =>
	(record: CategorisedRupeaRecord): RupeaTransaction => ({
		location: record.location,
		date: record.date,
		time: null,
		description: words(record.description).join(' '),
		metadata: {},
		comment: null,
		postings: [
			{
				account,
				amount: record.amount,
				commodity: DEFAULT_COMMODITY,
				price: null,
				cost: null,
				balance: record.balance,
				metadata: {},
				comment: null,
			},
			{
				account: record.account,
				amount: -record.amount as Amount,
				commodity: DEFAULT_COMMODITY,
				price: null,
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
		],
	});

const categoryAccount = (record: RupeaRecord): string | null => {
	if (!record.category) return null;

	const account = words(record.category).join('-');
	return accountType(account) ? account : null;
};

// A `.rupea` header is one line, and an account a single word.
const words = (t: string) => t.trim().split(/\s+/);
