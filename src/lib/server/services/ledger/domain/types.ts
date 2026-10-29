import type { RupeaError } from '#lib/server/shared/result/error.ts';
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

/** Where a price was read: a P line, a posting's at-price, or a feed's quote. */
export enum PriceSource {
	Line = 'line',
	Posting = 'posting',
	Mfapi = 'mfapi',
	Yahoo = 'yahoo',
}

/** Where a symbol's prices come from; a ledger's own symbols are priced by its files. */
export enum Feed {
	Ledger = 'ledger',
	Mfapi = 'mfapi',
	Yahoo = 'yahoo',
}

export enum LotOrigin {
	Buy = 'buy',
	Transfer = 'transfer',
	Short = 'short',
	Unpriced = 'unpriced',
}

/** Who finds a problem, so each replaces only its own. */
export enum ProblemKind {
	Parse = 'parse',
}

export enum DisposalKind {
	Sale = 'sale',
	Transfer = 'transfer',
	Gift = 'gift',
	Cover = 'cover',
}

/** The owner is the user whose storage holds the ledger. */
export type Ledger = { id: string; handle: string; name: string; owner: string };

export type RupeaFile = {
	key: string;
	size: number;
	modified: Date;
	version: string;
	content: string;
};

export type RupeaParseLocation = { file: string; line: number };

/** A repeated key collects its values in the order they were written. */
export type RupeaMetadata = Record<string, string[]>;

export type Price = Quantity & { kind: PriceKind };
export type LotCost = Quantity & { date: Temporal.PlainDate | null };

export type RupeaPosting = {
	account: string;
	amount: Amount;
	commodity: string;
	price: Price | null;
	cost: LotCost | null;
	/** What the account holds of the posting's commodity after it, if the file asserts it. */
	balance: Amount | null;
	metadata: RupeaMetadata;
	/** The comment lines under it, joined, if any. */
	comment: string | null;
};

export type RupeaTransaction = {
	location: RupeaParseLocation;
	date: Temporal.PlainDate;
	time: Temporal.PlainTime | null;
	description: string;
	metadata: RupeaMetadata;
	/** The comment lines under its header, joined, if any. */
	comment: string | null;
	postings: RupeaPosting[];
};

export type RupeaMarketPrice = {
	location: RupeaParseLocation;
	date: Temporal.PlainDate;
	commodity: string;
	price: Quantity;
};

/** Prices a commodity by a feed's symbol from a day on, or from the start when since is null. */
export type RupeaLink = {
	location: RupeaParseLocation;
	since: Temporal.PlainDate | null;
	commodity: string;
	feed: Feed;
	symbol: string;
};

export type RupeaLedgerFile = {
	metadata: RupeaMetadata;
	transactions: RupeaTransaction[];
	prices: RupeaMarketPrice[];
	links: RupeaLink[];
};

/** What a file is read into, in the order it was written, so it prints back without loss. */
export enum NodeKind {
	File = 'file',
	Transaction = 'transaction',
	Posting = 'posting',
	Price = 'price',
	Link = 'link',
	Note = 'note',
	Failed = 'failed',
}

/** Metadata as written, a key and a value per line. */
export type RupeaEntries = [string, string][];

/** Comments are the lines under a node, each without its semicolon. */
export type RupeaFileNode = {
	kind: NodeKind.File;
	comments: string[];
	metadata: RupeaEntries;
	children: RupeaEntryNode[];
};

export type RupeaEntryNode =
	RupeaTransactionNode | RupeaPriceNode | RupeaLinkNode | RupeaNoteNode | RupeaFailedNode;

export type RupeaNode = RupeaFileNode | RupeaEntryNode | RupeaPostingNode;

export type RupeaTransactionNode = {
	kind: NodeKind.Transaction;
	location: RupeaParseLocation;
	comments: string[];
	date: Temporal.PlainDate;
	time: Temporal.PlainTime | null;
	description: string;
	metadata: RupeaEntries;
	children: RupeaPostingNode[];
};

/** An elided posting was written without its amount, which balances the others. */
export type RupeaPostingNode = {
	kind: NodeKind.Posting;
	comments: string[];
	account: string;
	amount: Amount;
	elided: boolean;
	commodity: string;
	price: Price | null;
	cost: LotCost | null;
	balance: Amount | null;
	metadata: RupeaEntries;
	children: [];
};

export type RupeaPriceNode = {
	kind: NodeKind.Price;
	location: RupeaParseLocation;
	comments: string[];
	date: Temporal.PlainDate;
	commodity: string;
	price: Quantity;
	children: [];
};

export type RupeaLinkNode = {
	kind: NodeKind.Link;
	location: RupeaParseLocation;
	comments: string[];
	since: Temporal.PlainDate | null;
	commodity: string;
	feed: Feed;
	symbol: string;
	children: [];
};

/** Comments that nothing above holds, after a blank line or at the top of the entries. */
export type RupeaNoteNode = { kind: NodeKind.Note; comments: string[]; children: [] };

/** Lines that do not read, kept as written. */
export type RupeaFailedNode = {
	kind: NodeKind.Failed;
	location: RupeaParseLocation;
	comments: string[];
	lines: string[];
	errors: RupeaError[];
	children: [];
};
