import type { Amount, Quantity } from './amounts';

export enum AccountType {
	Assets = 'Assets',
	Liabilities = 'Liabilities',
	Income = 'Income',
	Expenses = 'Expenses',
	Equity = 'Equity',
}

/** How a posting wrote its price, @ for one unit or @@ for all, so it prints back the same. */
export enum PriceKind {
	Unit = 'unit',
	Total = 'total',
}

export enum PriceSource {
	Line = 'line',
	Posting = 'posting',
}

export enum LotOrigin {
	Buy = 'buy',
	Transfer = 'transfer',
	Short = 'short',
	Unpriced = 'unpriced',
}

export enum DisposalKind {
	Sale = 'sale',
	Transfer = 'transfer',
	Gift = 'gift',
	Cover = 'cover',
}

/** The owner is the user whose storage holds the ledger. */
export type Ledger = { id: string; handle: string; name: string; owner: string };

export type RupeeFile = {
	key: string;
	size: number;
	modified: Date;
	version: string;
	content: string;
};

export type RupeeParseLocation = { file: string; line: number };

/** A repeated key collects its values in the order they were written. */
export type RupeeMetadata = Record<string, string[]>;

export type Price = Quantity & { kind: PriceKind };
export type LotCost = Quantity & { date: Temporal.PlainDate | null };

export type RupeePosting = {
	account: string;
	amount: Amount;
	commodity: string;
	price: Price | null;
	cost: LotCost | null;
	/** What the account holds of the posting's commodity after it, if the file asserts it. */
	balance: Amount | null;
	metadata: RupeeMetadata;
};

export type RupeeTransaction = {
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	time: Temporal.PlainTime | null;
	description: string;
	metadata: RupeeMetadata;
	postings: RupeePosting[];
};

export type RupeeMarketPrice = {
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	commodity: string;
	price: Quantity;
};

export type RupeeLedgerFile = {
	metadata: RupeeMetadata;
	transactions: RupeeTransaction[];
	prices: RupeeMarketPrice[];
};
