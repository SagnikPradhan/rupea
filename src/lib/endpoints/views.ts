import type * as Accounts from '#services/ledger/application/accounts.ts';
import type * as Events from '#services/ledger/application/events.ts';
import {
	DEFAULT_COMMODITY,
	formatAmount,
	formatQuantity,
	printQuantity,
	type Amount,
	type RupeaTransaction,
} from '#services/ledger/application/shared.ts';
import type * as Transactions from '#services/ledger/application/transactions.ts';
import type * as Refinement from '#services/refinement/application/refinement.ts';

/** For reading, not for writing back: amounts as text, the time to the minute. */
export const viewTransaction = (transaction: RupeaTransaction) => ({
	file: transaction.location.file,
	line: transaction.location.line,
	date: transaction.date.toString(),
	time: transaction.time?.toString({ smallestUnit: 'minute' }) ?? null,
	description: transaction.description,
	postings: transaction.postings.map((p) => ({ account: p.account, quantity: printQuantity(p) })),
});

export const viewCounted = ({ id, counted, ...transaction }: Transactions.CountedTransaction) => ({
	id,
	counted,
	...viewTransaction(transaction),
});

export const viewPosting = (listed: Transactions.ListedPosting) => ({
	key: `${listed.transaction}:${listed.position}`,
	file: listed.location.file,
	line: listed.location.line,
	date: listed.date.toString(),
	description: listed.description,
	account: listed.posting.account,
	quantity: printQuantity(listed.posting),
});

export const viewSuggestion = ({ ours, theirs, ...suggestion }: Refinement.Suggestion) => ({
	...suggestion,
	ours: viewTransaction(ours),
	theirs: viewTransaction(theirs),
});

export const viewEvent = ({ event, members }: Events.FileEvent) => ({
	event,
	members: members.map(({ role, counted, ...t }) => ({ role, counted, ...viewTransaction(t) })),
});

export const viewAccount = (account: Accounts.Account) => ({
	account: account.account,
	parent: account.parent,
	total: formatAmount(account.total),
	cost: formatOptional(account.cost),
	gain: formatOptional(account.gain),
	unpriced: account.unpriced,
	holdings: account.holdings.map((holding) => ({
		commodity: holding.commodity,
		hasLots: holding.hasLots,
		units:
			holding.commodity === DEFAULT_COMMODITY
				? null
				: formatQuantity({ amount: holding.units, commodity: holding.commodity }),
		cost: formatOptional(holding.paid),
		price: holding.price && formatQuantity(holding.price),
		value: formatOptional(holding.value),
		gain: formatOptional(holding.gain),
	})),
});

export const viewWorth = (worth: Accounts.Worth) => ({
	day: worth.day.toString(),
	assets: formatAmount(worth.assets),
	liabilities: formatAmount(worth.liabilities),
	worth: formatAmount(worth.worth),
	parts: worth.parts.map((p) => ({ ...p, amount: formatAmount(p.amount) })),
	unpriced: worth.unpriced,
});

export const viewReturns = (returns: Accounts.Returns) => ({
	account: returns.account,
	netIn: formatAmount(returns.netIn),
	xirr: returns.xirr,
	yearly: returns.yearly,
});

export const viewSpending = (spending: Accounts.Spending) => ({
	from: spending.from.toString(),
	to: spending.to.toString(),
	bucket: spending.bucket,
	buckets: spending.buckets.map((b) => b.toString()),
	totals: spending.totals.map((t) => ({
		account: t.account,
		parent: t.parent,
		amount: formatAmount(t.amount),
		unpriced: t.unpriced,
	})),
	spent: spending.spent.map((s) => ({
		account: s.account,
		bucket: s.bucket.toString(),
		amount: formatAmount(s.amount),
		unpriced: s.unpriced,
	})),
});

export const viewLot = (lot: Accounts.LotHistory) => ({
	file: lot.location.file,
	line: lot.location.line,
	date: lot.date.toString(),
	origin: lot.origin,
	from: lot.from,
	units: formatAmount(lot.units),
	remaining: formatAmount(lot.remaining),
	cost: formatQuantity(lot.cost),
	disposals: lot.disposals.map((disposal) => ({
		file: disposal.location.file,
		line: disposal.location.line,
		date: disposal.date.toString(),
		kind: disposal.kind,
		units: formatAmount(disposal.units),
		price: disposal.price && formatQuantity(disposal.price),
		gain: disposal.gain && formatQuantity(disposal.gain),
	})),
});

const formatOptional = (a: Amount | null) => (a === null ? null : formatAmount(a));
