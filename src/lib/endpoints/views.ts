import type * as Accounts from '@rupea/server/services/ledger/application/accounts.ts';
import type * as Groups from '@rupea/server/services/ledger/application/groups.ts';
import {
	DEFAULT_COMMODITY,
	type RupeaTransaction,
	printAmount,
	formatQuantity,
	printQuantity,
} from '@rupea/server/services/ledger/application/language.ts';
import type * as Transactions from '@rupea/server/services/ledger/application/transactions.ts';
import type * as Refinement from '@rupea/server/services/refinement/application/refinement.ts';

/** For reading, not for writing back: amounts as text, the time to the minute. */
export const viewTransaction = (transaction: RupeaTransaction) => ({
	file: transaction.location.file,
	line: transaction.location.line,
	date: transaction.date.toString(),
	time: transaction.time?.toString({ smallestUnit: 'minute' }) ?? null,
	description: transaction.description,
	comment: transaction.comment,
	postings: transaction.postings.map((p) => ({ account: p.account, quantity: printQuantity(p) })),
});

export const viewCounted = ({ id, counted, ...transaction }: Transactions.CountedTransaction) => ({
	id,
	counted,
	...viewTransaction(transaction),
});

export const viewPosting = (listed: Transactions.ListedPosting) => ({
	key: `${listed.transaction}:${listed.position}`,
	transaction: listed.transaction,
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

export const viewGroup = ({ group, members }: Groups.FileGroup) => ({
	group,
	members: members.map(({ role, counted, ...t }) => ({ role, counted, ...viewTransaction(t) })),
});

export const viewAccount = (account: Accounts.Account) => ({
	account: account.account,
	parent: account.parent,
	total: account.total,
	cost: account.cost,
	gain: account.gain,
	unpriced: account.unpriced,
	holdings: account.holdings.map((holding) => ({
		commodity: holding.commodity,
		hasLots: holding.hasLots,
		units:
			holding.commodity === DEFAULT_COMMODITY
				? null
				: formatQuantity({ amount: holding.units, commodity: holding.commodity }),
		cost: printAmount(holding.paid),
		price: holding.price && formatQuantity(holding.price),
		value: printAmount(holding.value),
		gain: printAmount(holding.gain),
	})),
});

export const viewWorth = (worth: Accounts.Worth) => ({
	day: worth.day.toString(),
	assets: printAmount(worth.assets),
	liabilities: printAmount(worth.liabilities),
	worth: printAmount(worth.worth),
	parts: worth.parts.map((p) => ({ ...p, amount: printAmount(p.amount) })),
	unpriced: worth.unpriced,
});

export const viewInvested = (invested: Accounts.Invested) => ({
	day: invested.day.toString(),
	value: printAmount(invested.value),
	cost: printAmount(invested.cost),
});

export const viewDrops = (drops: Accounts.Drops) => ({
	underwater: drops.underwater.map((u) => ({ day: u.day.toString(), depth: u.depth })),
	lows: drops.lows.map((l) => ({ account: l.account, depth: l.depth, day: l.day.toString() })),
	swings: drops.swings,
});

export const viewBridge = (bridge: Accounts.Bridge) => ({
	from: bridge.from.toString(),
	to: bridge.to.toString(),
	start: printAmount(bridge.start),
	income: printAmount(bridge.income),
	expenses: printAmount(bridge.expenses),
	shifts: bridge.shifts.map((s) => ({ account: s.account, amount: printAmount(s.amount) })),
	other: printAmount(bridge.other),
	end: printAmount(bridge.end),
});

export const viewReturns = (returns: Accounts.Returns) => ({
	account: returns.account,
	netIn: printAmount(returns.netIn),
	xirr: returns.xirr,
	yearly: returns.yearly,
});

export const viewDeltas = (spending: Accounts.Deltas) => ({
	from: spending.from,
	to: spending.to,
	bucket: spending.bucket,
	buckets: spending.buckets,
	totals: spending.totals.map((t) => ({
		account: t.account,
		parent: t.parent,
		amount: t.amount,
		inflow: t.inflow,
		outflow: t.outflow,
		unpriced: t.unpriced,
	})),
	deltas: spending.deltas.map((s) => ({
		account: s.account,
		bucket: s.bucket,
		amount: s.amount,
		inflow: s.inflow,
		outflow: s.outflow,
		unpriced: s.unpriced,
	})),
});

export const viewDaily = (daily: Accounts.Daily) => ({
	day: daily.day,
	amount: printAmount(daily.amount),
	unpriced: daily.unpriced,
});

export const viewLot = (lot: Accounts.LotHistory) => ({
	file: lot.location.file,
	line: lot.location.line,
	date: lot.date.toString(),
	origin: lot.origin,
	from: lot.from,
	units: printAmount(lot.units),
	remaining: printAmount(lot.remaining),
	cost: formatQuantity(lot.cost),
	disposals: lot.disposals.map((disposal) => ({
		file: disposal.location.file,
		line: disposal.location.line,
		date: disposal.date.toString(),
		kind: disposal.kind,
		units: printAmount(disposal.units),
		price: disposal.price && formatQuantity(disposal.price),
		gain: disposal.gain && formatQuantity(disposal.gain),
	})),
});
