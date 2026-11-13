import { Account, Deltas, Group, Lot, Posting, Suggestion } from '@rupea/contract/outputs.ts';
import { Amount } from '@rupea/shared/amounts.ts';
import { Day } from '@rupea/shared/dates.ts';
import { LinkTarget } from '@rupea/shared/groups.ts';
import { DEFAULT_COMMODITY, printPosted, printQuantity } from '@rupea/shared/quantities.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import * as v from 'valibot';

type Transaction = v.InferOutput<typeof TransactionOut>;

export type TransactionView = {
	file: string;
	line: number;
	date: string;
	time: string | null;
	description: string;
	comment: string | null;
	postings: { account: string; quantity: string }[];
};

export type SuggestionView = {
	fingerprint: string;
	confidence: 'duplicate' | 'possible';
	group: string | null;
	links: v.InferOutput<typeof LinkTarget>[];
	ours: TransactionView;
	theirs: TransactionView;
};

/** For reading, not for writing back: amounts as text, the time to the minute. */
export const viewTransaction = (transaction: Transaction): TransactionView => ({
	file: transaction.file,
	line: transaction.line,
	date: transaction.date,
	time: transaction.time?.slice(0, 5) ?? null,
	description: transaction.description,
	comment: transaction.comment,
	postings: transaction.postings.map((p) => ({
		account: p.account,
		quantity: printPosted(p.quantity),
	})),
});

export const viewCounted = ({
	id,
	counted,
	...transaction
}: Transaction & { id: string; counted: boolean }) => ({
	id,
	counted,
	...viewTransaction(transaction),
});

type PostingOut = v.InferOutput<typeof Posting>;

export const viewPosting = (posting: PostingOut) => ({
	key: `${posting.transaction}:${posting.position}`,
	transaction: posting.transaction,
	file: posting.file,
	line: posting.line,
	date: posting.date,
	description: posting.description,
	account: posting.account,
	quantity: printPosted(posting.quantity),
});

type SuggestionOut = v.InferOutput<typeof Suggestion>;

export const viewSuggestion = ({ ours, theirs, ...suggestion }: SuggestionOut): SuggestionView => ({
	...suggestion,
	ours: viewTransaction(ours),
	theirs: viewTransaction(theirs),
});

type GroupOut = v.InferOutput<typeof Group>;

export const viewGroup = ({ group, members }: GroupOut) => ({
	group,
	members: members.map(({ role, counted, ...t }) => ({ role, counted, ...viewTransaction(t) })),
});

type AccountOut = v.InferOutput<typeof Account>;

export const viewAccount = (account: AccountOut) => ({
	...account,
	total: v.parse(Amount, account.total),
	cost: v.parse(v.nullable(Amount), account.cost),
	gain: v.parse(v.nullable(Amount), account.gain),
	holdings: account.holdings.map(viewHolding),
});

type DeltasOut = v.InferOutput<typeof Deltas>;

export const viewDeltas = (deltas: DeltasOut) => ({
	from: v.parse(Day, deltas.from),
	to: v.parse(Day, deltas.to),
	bucket: deltas.bucket,
	buckets: deltas.buckets.map((b) => v.parse(Day, b)),
	totals: deltas.totals.map((t) => ({
		account: t.account,
		parent: t.parent,
		amount: v.parse(Amount, t.amount),
		inflow: v.parse(Amount, t.inflow),
		outflow: v.parse(Amount, t.outflow),
		unpriced: t.unpriced,
	})),
	deltas: deltas.deltas.map((d) => ({
		account: d.account,
		bucket: v.parse(Day, d.bucket),
		amount: v.parse(Amount, d.amount),
		inflow: v.parse(Amount, d.inflow),
		outflow: v.parse(Amount, d.outflow),
		unpriced: d.unpriced,
	})),
});

type LotOut = v.InferOutput<typeof Lot>;

export const viewLot = (lot: LotOut) => ({
	file: lot.location.file,
	line: lot.location.line,
	date: lot.date,
	origin: lot.origin,
	from: lot.from,
	units: lot.units,
	remaining: lot.remaining,
	cost: printQuantity(lot.cost),
	disposals: lot.disposals.map((disposal) => ({
		file: disposal.location.file,
		line: disposal.location.line,
		date: disposal.date,
		kind: disposal.kind,
		units: disposal.units,
		price: disposal.price && printQuantity(disposal.price),
		gain: disposal.gain && printQuantity(disposal.gain),
	})),
});

const viewHolding = (holding: AccountOut['holdings'][number]) => ({
	commodity: holding.commodity,
	hasLots: holding.hasLots,
	units:
		holding.commodity === DEFAULT_COMMODITY
			? null
			: printQuantity({ amount: holding.units, commodity: holding.commodity }),
	cost: holding.paid,
	price: holding.price && printQuantity(holding.price),
	value: holding.value,
	gain: holding.gain,
});
