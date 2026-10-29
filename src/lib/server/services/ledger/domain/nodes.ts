import {
	NodeKind,
	type RupeaEntries,
	type RupeaEntryNode,
	type RupeaFileNode,
	type RupeaLedgerFile,
	type RupeaLink,
	type RupeaLinkNode,
	type RupeaMarketPrice,
	type RupeaMetadata,
	type RupeaPriceNode,
	type RupeaTransaction,
	type RupeaTransactionNode,
} from './types';

/** A file as it is written first; a single outgoing posting leaves its amount out. */
export const toNode = (file: RupeaLedgerFile): RupeaFileNode => ({
	kind: NodeKind.File,
	comments: [],
	metadata: entriesOf(file.metadata),
	children: [
		...file.transactions.map(transactionNode),
		...file.prices.map(priceNode),
		...file.links.map(linkNode),
	],
});

export const transactionOf = (t: RupeaTransactionNode): RupeaTransaction => ({
	location: t.location,
	date: t.date,
	time: t.time,
	description: t.description,
	metadata: toMetadata(t.metadata),
	comment: joined(t.comments),
	postings: t.children.map((p) => ({
		account: p.account,
		amount: p.amount,
		commodity: p.commodity,
		price: p.price,
		cost: p.cost,
		balance: p.balance,
		metadata: toMetadata(p.metadata),
		comment: joined(p.comments),
	})),
});

export const priceOf = (p: RupeaPriceNode): RupeaMarketPrice => ({
	location: p.location,
	date: p.date,
	commodity: p.commodity,
	price: p.price,
});

export const linkOf = (l: RupeaLinkNode): RupeaLink => ({
	location: l.location,
	since: l.since,
	commodity: l.commodity,
	feed: l.feed,
	symbol: l.symbol,
});

export const toMetadata = (entries: RupeaEntries): RupeaMetadata =>
	Object.fromEntries(
		Object.entries(Object.groupBy(entries, ([key]) => key)).map(([key, group = []]) => [
			key,
			group.map(([, value]) => value),
		]),
	);

// With prices or several commodities every amount is spelled out.
const transactionNode = (t: RupeaTransaction): RupeaEntryNode => {
	const outgoing = t.postings.filter((p) => p.amount < 0n);
	const plain = t.postings.every(
		(p) => p.price === null && p.cost === null && p.commodity === t.postings[0]?.commodity,
	);
	const elided = plain && outgoing.length === 1 ? outgoing[0] : undefined;

	return {
		kind: NodeKind.Transaction,
		location: t.location,
		comments: linesOf(t.comment),
		date: t.date,
		time: t.time,
		description: t.description,
		metadata: entriesOf(t.metadata),
		children: t.postings.map((p) => ({
			kind: NodeKind.Posting,
			comments: linesOf(p.comment),
			account: p.account,
			amount: p.amount,
			elided: p === elided,
			commodity: p.commodity,
			price: p.price,
			cost: p.cost,
			balance: p.balance,
			metadata: entriesOf(p.metadata),
			children: [],
		})),
	};
};

const priceNode = (p: RupeaMarketPrice): RupeaEntryNode => ({
	kind: NodeKind.Price,
	location: p.location,
	comments: [],
	date: p.date,
	commodity: p.commodity,
	price: p.price,
	children: [],
});

const linkNode = (l: RupeaLink): RupeaEntryNode => ({
	kind: NodeKind.Link,
	location: l.location,
	comments: [],
	since: l.since,
	commodity: l.commodity,
	feed: l.feed,
	symbol: l.symbol,
	children: [],
});

const entriesOf = (m: RupeaMetadata): RupeaEntries =>
	Object.entries(m).flatMap(([key, values]) => values.map((v): [string, string] => [key, v]));

const linesOf = (c: string | null): string[] => (c === null ? [] : c.split('\n'));

const joined = (c: string[]) => (c.length > 0 ? c.join('\n') : null);
