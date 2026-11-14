import {
	Balances,
	Group,
	LinkTarget,
	Lot,
	Posting,
	Suggestion,
	TransactionOut,
} from '@rupea/contract/shape-ledger.ts';
import { parentsIn, partsIn, type AccountRow } from '@rupea/shared/account-tree.ts';
import { bucketFor, bucketKeyOf } from '@rupea/shared/balances.ts';
import { bucketsIn, Day, type Grain } from '@rupea/shared/dates.ts';
import {
	Amount,
	DEFAULT_COMMODITY,
	hasLots,
	printAmount,
	printPosted,
	printQuantity,
	sum,
	ZERO,
} from '@rupea/shared/money.ts';
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

/**
 * The holdings with lots under the account at the end of each bucket, what they
 * were worth beside what was paid for them, each dated by the day its bucket
 * closes.
 */
export const investedFrom = (deltas: DeltasOut) => {
	const to = v.parse(Day, deltas.to);
	const depth = (r: RowOut) => r.account.split(':').length;
	const top = Math.min(...deltas.rows.map(depth));
	const lotted = deltas.rows.filter((r) => depth(r) === top && hasLots(r.commodity ?? ''));
	const byBucket = Object.groupBy(lotted, (r) => r.bucket);

	return Object.entries(byBucket)
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([bucket, rows = []]) => ({
			day: closeOf(bucket, to),
			value: printAmount(sum(rows.map((r) => amountOf(r.value)))),
			cost: printAmount(sum(rows.map((r) => amountOf(r.paid)))),
		}));
};

type ViewWorthOptions = { tree: AccountRow[]; account: string | null };

/**
 * Net worth at the end of each bucket: what the balance accounts held
 * themselves, assets and liabilities apart, and the parts worth is divided into
 * under the account, each one's commodities too when it divides into nothing.
 */
export const worthFrom = (deltas: DeltasOut, { tree, account }: ViewWorthOptions) => {
	const parents = parentsIn(tree);
	const { parts, byCommodity } = partsIn(tree, account);
	const partOf = Object.fromEntries(parts.map((p) => [p.account, p.part]));
	const to = v.parse(Day, deltas.to);
	const held = deltas.rows.filter((r) => partOf[r.account] !== undefined);
	const byBucket = Object.groupBy(held, (r) => r.bucket);

	return Object.entries(byBucket)
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([bucket, rows = []]) => {
			const own = rows.map((r) => ({
				part: partOf[r.account] ?? r.account,
				asset: /^assets(:|$)/i.test(r.account),
				commodity: r.commodity ?? DEFAULT_COMMODITY,
				...ownValueOf(
					r,
					rows.filter((k) => parents[k.account] === r.account),
				),
			}));
			const shares = Object.values(
				Object.groupBy(own, (o) => `${o.part} ${byCommodity ? o.commodity : ''}`),
			).flatMap((g = []) => {
				const amount = sum(g.map((o) => o.value));
				const first = g[0];
				return first === undefined || amount === 0n
					? []
					: [
							{
								account: first.part,
								commodity: byCommodity ? first.commodity : null,
								amount: printAmount(amount),
							},
						];
			});
			const assets = sum(own.filter((o) => o.asset).map((o) => o.value));
			const liabilities = sum(own.filter((o) => !o.asset).map((o) => o.value));

			return {
				day: closeOf(bucket, to),
				assets: printAmount(assets),
				liabilities: printAmount(liabilities),
				worth: printAmount((assets + liabilities) as Amount),
				parts: shares,
				unpriced: new Set(own.filter((o) => o.unpriced > 0).map((o) => o.commodity)).size,
			};
		});
};

/** A row less the same commodity's rows of the accounts drawn under it. */
const ownValueOf = (r: RowOut, under: RowOut[]) => {
	const kids = under.filter((k) => k.commodity === r.commodity);

	return {
		value: (amountOf(r.value) - sum(kids.map((k) => amountOf(k.value)))) as Amount,
		unpriced: r.unpriced - kids.reduce((n, k) => n + k.unpriced, 0),
	};
};

/** The day a date or month closes on, held to the last day of the span. */
const closeOf = (bucket: string, last: Temporal.PlainDate) => {
	const end =
		bucket.length === 10
			? Temporal.PlainDate.from(bucket)
			: Temporal.PlainYearMonth.from(bucket).toPlainDate({ day: 31 });

	return (Temporal.PlainDate.compare(end, last) > 0 ? last : end).toString();
};

/**
 * What each account held at the end of a day, as the accounts page draws it:
 * what it holds itself by commodity, which is what it and its rows came to less
 * what the accounts drawn under it came to, and the totals of all it holds.
 */
export const viewHoldings = (deltas: DeltasOut, parents: Record<string, string | null>) =>
	Object.entries(Object.groupBy(deltas.rows, (r) => r.account)).map(([account, held = []]) => {
		const under = deltas.rows.filter((r) => parents[r.account] === account);
		const gained = held.filter((r) => hasLots(r.commodity ?? '') && r.unpriced === 0);

		return {
			account,
			parent: parents[account] ?? null,
			holdings: held.flatMap((r) => ownOf(r, under)),
			total: sum(held.map((r) => amountOf(r.value))),
			cost: gained.length === 0 ? null : sum(gained.map((r) => amountOf(r.cost))),
			gain:
				gained.length === 0
					? null
					: sum(gained.map((r) => (amountOf(r.value) - amountOf(r.cost)) as Amount)),
			unpriced: held.filter((r) => r.unpriced > 0).length,
		};
	});

const amountOf = (t: string | undefined) => (t === undefined ? ZERO : v.parse(Amount, t));

/**
 * A row less the same commodity's rows of the accounts under it, if any is
 * left.
 */
const ownOf = (r: RowOut, under: RowOut[]) => {
	const kids = under.filter((k) => k.commodity === r.commodity);
	const units = amountOf(r.units) - sum(kids.map((k) => amountOf(k.units)));
	if (units === 0n) return [];

	const commodity = r.commodity ?? DEFAULT_COMMODITY;
	const unpriced = r.unpriced - kids.reduce((n, k) => n + k.unpriced, 0);
	const value = unpriced > 0 ? null : amountOf(r.value) - sum(kids.map((k) => amountOf(k.value)));
	const paid = hasLots(commodity)
		? amountOf(r.cost) - sum(kids.map((k) => amountOf(k.cost)))
		: null;

	return [
		{
			commodity,
			hasLots: hasLots(commodity),
			units:
				commodity === DEFAULT_COMMODITY
					? null
					: printQuantity({ amount: printAmount(units as Amount), commodity }),
			cost: paid === null ? null : printAmount(paid as Amount),
			price: r.price ? printQuantity(r.price) : null,
			value: value === null ? null : printAmount(value as Amount),
			gain: value === null || paid === null ? null : printAmount((value - paid) as Amount),
		},
	];
};

type DeltasOut = v.InferOutput<typeof Balances>;

type ViewDeltasOptions = { bucket: Grain; parents: Record<string, string | null> };

type RowOut = DeltasOut['rows'][number];

/**
 * What flowed over a span, as the pages draw it: every bucket the span touches,
 * the rows dated by their bucket's first day, and a total for each account
 * drawn, under the account it is drawn under.
 */
export const viewDeltas = (deltas: DeltasOut, { bucket, parents }: ViewDeltasOptions) => {
	const span = { from: v.parse(Day, deltas.from), to: v.parse(Day, deltas.to) };
	const buckets = bucketsIn(span, bucket);

	return {
		...span,
		bucket,
		buckets,
		totals: totalsOf(deltas.rows, parents),
		deltas: datedRows(deltas.rows, buckets, bucket),
	};
};

/**
 * Each row dated by the first day of its bucket, leaving out one the span does
 * not touch.
 */
const datedRows = (rows: RowOut[], buckets: Temporal.PlainDate[], bucket: Grain) =>
	rows.flatMap((r) => {
		const on = buckets.find((b) => bucketKeyOf[bucketFor[bucket]](b) === r.bucket);
		return on ? [{ ...viewed(r), bucket: on }] : [];
	});

/** Each account drawn, added up over its buckets. */
const totalsOf = (rows: RowOut[], parents: Record<string, string | null>) =>
	Object.entries(Object.groupBy(rows, (r) => r.account)).flatMap(([account, group]) => {
		if (!group || !Object.hasOwn(parents, account)) return [];
		const flows = group.map(viewed);

		return {
			account,
			parent: parents[account] ?? null,
			amount: sum(flows.map((f) => f.amount)),
			inflow: sum(flows.map((f) => f.inflow)),
			outflow: sum(flows.map((f) => f.outflow)),
			unpriced: flows.reduce((n, f) => n + f.unpriced, 0),
		};
	});

const viewed = (r: RowOut) => ({
	account: r.account,
	amount: v.parse(Amount, r.value),
	inflow: v.parse(Amount, r.inflow),
	outflow: v.parse(Amount, r.outflow),
	unpriced: r.unpriced,
});

/**
 * What an account averaged on each day of the month, one row for each day from
 * the 1st to the 31st.
 */
export const viewDaily = (deltas: DeltasOut | undefined, account: string) =>
	Array.from({ length: 31 }, (_, i) => {
		const row = deltas?.rows.find((r) => r.account === account && r.bucket === String(i + 1));
		return { day: i + 1, amount: row?.value ?? '0', unpriced: row?.unpriced ?? 0 };
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
