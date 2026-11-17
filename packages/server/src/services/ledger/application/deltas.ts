import { consistently } from '#lib/server/db/read-only.ts';
import { errAsync, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import {
	CLOSING_DAYS,
	endsIn,
	isReadable,
	type Accumulate,
	type Aggregate,
	type Bucket,
	type Measure,
} from '@rupea/shared/balances.ts';
import { BEGINNING, type Span } from '@rupea/shared/dates.ts';
import { fault, type Batch, type RupeaError } from '@rupea/shared/errors.ts';
import * as DB from '../adapters/database';
import { DEFAULT_COMMODITY, type Quantity } from '../domain/amounts';
import { closingsOf, holdingsOf, type Holding } from '../domain/closings';
import { lotsOf, unpricedCostsIn } from '../domain/closings-lots';
import { balancesOf, type Balances, type Delta } from '../domain/deltas';
import { EVERYTHING, type Filter } from '../domain/filters';
import { HOPS } from '../domain/holdings';
import { idsIn, ownPartsIn, parentsIn, type AccountNode } from '../domain/tree';
import { AccountType, type Ledger } from '../domain/types';
import {
	ratesOn,
	symbolsOf,
	type PartOf,
	type PriceSources,
	type PriceYear,
	type WorthOfOptions,
} from '../domain/worth';
import { checkLots } from './checks';

/**
 * The most days a span may cover, counted from the later of its start and the
 * first day with data, which is a hundred years.
 */
const SPAN_MOST_DAYS = 36_600;

type ListDeltasOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account?: string | undefined;
	filter?: Filter;
	bucket: Bucket;
	aggregate?: Aggregate;
	measures?: Measure[];
};

/**
 * What an account and those under it, or every account, gained in the base over
 * a span, by each account drawn and the bucket its day falls in: a date, a day
 * of the month, a month or a year. A bucket the span comes to more than once is
 * summed or averaged, and only a day of the month does. Only the postings that
 * pass the filter count, all of them when there is none. Fails for a span that
 * runs backwards or covers more than SPAN_MOST_DAYS, or more than CLOSING_DAYS
 * by date.
 */
export const listDeltas = ({
	ledger,
	from,
	to,
	account,
	filter,
	bucket,
	aggregate = 'sum',
	measures = ['value'],
}: ListDeltasOptions): ResultAsync<Batch<Balances>> =>
	consistently(() => {
		const refused = refusal({ from, to }, { accumulate: 'change', aggregate, bucket, measures });
		if (refused) return errAsync(refused);

		return listed(ledger.id, account).andThen(({ failed, tree, accounts }) => {
			const base = DEFAULT_COMMODITY;
			const read = { span: { from, to }, tree, accounts, filter, bucket, measures, base };

			return changed(ledger.id, read).map(({ span, rows }) => {
				const parents = parentsIn(tree);
				const balances = balancesOf(rows, { span, base, bucket, aggregate, measures, parents });
				return { succeeded: [balances], failed };
			});
		});
	});

type ListBalancesOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account?: string | undefined;
	bucket: Bucket;
	aggregate?: Aggregate;
	measures?: Measure[];
};

/**
 * What balance accounts were worth at the end of each bucket of a span, from
 * the ledger's first day at the earliest, and with a cost or paid the lots that
 * match no sale are failures. Fails for a span that runs backwards or covers
 * more than SPAN_MOST_DAYS, or more than CLOSING_DAYS by date.
 */
export const listBalances = ({
	ledger,
	from,
	to,
	account,
	bucket,
	aggregate = 'sum',
	measures = ['value'],
}: ListBalancesOptions): ResultAsync<Batch<Balances>> =>
	consistently(() => {
		const refused = refusal(
			{ from, to },
			{ accumulate: 'historical', aggregate, bucket, measures },
		);
		if (refused) return errAsync(refused);

		return listed(ledger.id, account).andThen(({ failed, tree, accounts }) => {
			const base = DEFAULT_COMMODITY;
			const read = { span: { from, to }, tree, accounts, bucket, measures, base };

			const checked = measures.some((m) => m === 'cost' || m === 'paid')
				? checkLots(ledger, { accounts, to })
				: okAsync([] as RupeaError[]);

			return ResultAsync.combine([closing(ledger.id, read), checked]).map(
				([{ span, rows, faults }, unmatched]) => {
					const parents = parentsIn(tree);
					const balances = balancesOf(rows, { span, base, bucket, aggregate, measures, parents });
					return { succeeded: [balances], failed: [...failed, ...faults, ...unmatched] };
				},
			);
		});
	});

type Reading = {
	accumulate: Accumulate;
	aggregate: Aggregate;
	bucket: Bucket;
	measures: Measure[];
};

/** Why a balances read is refused before it reads anything, when it is. */
const refusal = (span: Span, o: Reading): RupeaError | null =>
	unclosedSpan(span, o.bucket) ??
	(isReadable(o)
		? null
		: fault('InvalidRequest', { field: unreadableFieldOf(o), reason: 'unreadable' }));

/** The ledger's problems and account tree, and the accounts the read names. */
const listed = (id: string, account: string | undefined) =>
	ResultAsync.combine([DB.listProblems(id), DB.listAccountTree(id)]).andThen(([failed, tree]) => {
		const accounts = account === undefined ? tree.map((n) => n.id) : idsIn(tree, account);
		if (account !== undefined && !accounts.length && !isRoot(account))
			return errAsync(fault('AccountNotFound', { account }));

		return okAsync({ failed, tree, accounts });
	});

/** The field of an unreadable balances read that can be named, else measures. */
const unreadableFieldOf = (o: Reading) => {
	if (o.aggregate === 'average' && o.bucket !== 'day') return 'aggregate';
	return o.accumulate === 'historical' && o.bucket === 'day' ? 'bucket' : 'measures';
};

const isRoot = (a: string) =>
	Object.values(AccountType).some((r) => r.toLowerCase() === a.toLowerCase());

type BalancesRead = {
	span: Span;
	tree: AccountNode[];
	accounts: string[];
	filter?: Filter | undefined;
	bucket: Bucket;
	measures: Measure[];
	base: string;
};

/** What the accounts gained in each bucket of the span. */
const changed = (id: string, { span, accounts, filter = EVERYTHING, bucket, base }: BalancesRead) =>
	spanFrom(id, span, accounts).andThen((started) => {
		const long = unclosedSpan(started, bucket);
		if (long) return errAsync(long);

		return DB.listDeltas(id, { ...started, accounts, filter, bucket, base }).map((rows) => ({
			span: started,
			rows,
		}));
	});

/**
 * What the balance accounts held at the end of each bucket of the span: the
 * units of each commodity, what they were worth, what their lots cost at that
 * day's prices and at the prices of the days they were paid for, and the price
 * of a unit. Each is what they held before the span, from the monthly deltas
 * and the lots, and the running sum of what they gained in each bucket, valued
 * at the prices of the bucket's last day. An account that holds a commodity
 * with no price on that day is a failure.
 */
const closing = (id: string, read: BalancesRead) => {
	const { span, tree, accounts, measures, base } = read;
	const bucket = read.bucket as 'date' | 'month' | 'year';
	const asked = { from: span.from.toString() === BEGINNING ? span.to : span.from, to: span.to };

	const parts = ownPartsIn(tree, accounts);
	const ids = parts.map((p) => p.accountId);
	const names = Object.fromEntries(parts.map((p) => [p.accountId, p.part]));

	return startOf(id, span, ids).andThen((start) => {
		if (start === null) return okAsync({ span: asked, rows: [] as Delta[], faults: [] });

		const walked = { from: start, to: span.to };
		const long = unclosedSpan(walked, bucket);
		if (long) return errAsync(long);

		const scope = { accounts: ids, ...walked, bucket };

		return ResultAsync.combine([
			DB.listOpenings(id, { accounts: ids, before: start }),
			DB.listUnitDeltas(id, scope),
			lotsRead(id, { ...scope, measures, names, base }),
			DB.listPriceSources(id),
		]).andThen(([openings, gains, lots, sources]) => {
			const holdings = holdingsOf({ openings, gains }, names);
			const costs = Object.values(lots).flatMap((l) => Object.keys(l.costs));
			const commodities = [...new Set([...holdings.map((h) => h.commodity), ...costs])];
			const years = { from: start.year, to: span.to.year };

			return pricesWalked({ id, start, years, sources, commodities, base, hops: HOPS }).map(
				({ prices, opening }) => {
					const ends = endsIn(walked, bucket);
					const ratesFor = ratesOn({ ...walked, prices, sources, opening }, ends);
					const closed = closingsOf(holdings, { base, bucket, ends, lots, ratesFor });
					const faults = [
						...unpricedFaults(closed.unpriced),
						...unpricedCostsIn(lots).map((c) => fault('CostUnpriced', { commodity: c })),
					];

					return { span: walked, rows: closed.rows, faults };
				},
			);
		});
	});
};

type LotsReadOptions = {
	accounts: string[];
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: 'date' | 'month' | 'year';
	measures: Measure[];
	names: Record<string, string>;
	base: string;
};

/**
 * What the lots of the accounts cost before the span and in each bucket of it,
 * valued at the prices of the days they were paid for when paid is asked. Cost
 * and paid are the only measures that read lots.
 */
const lotsRead = (id: string, o: LotsReadOptions) => {
	const { accounts, from, to, bucket, measures, names, base } = o;
	const paid = measures.includes('paid');
	const costed = paid || measures.includes('cost');

	return ResultAsync.combine([
		costed ? DB.listCostOpenings(id, { accounts, before: from }) : okAsync([]),
		costed ? DB.listCostDeltas(id, { accounts, from, to, bucket }) : okAsync([]),
	]).andThen(([openings, gains]) =>
		boughtAt(id, { rows: paid ? [...openings, ...gains] : [], base }).map((b) =>
			lotsOf({ openings, gains }, { names, base, bought: b, paid }),
		),
	);
};

/** One failure for each account that holds something with no price, by name. */
const unpricedFaults = (u: Holding[]) =>
	Object.entries(Object.groupBy(u, (h) => h.account))
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([account, held = []]) => fault('BalanceUnpriced', { account, unpriced: held.length }));

type BoughtAtOptions = { rows: { cost: string; paid: Temporal.PlainDate }[]; base: string };

/**
 * The prices in the base of the days lots were paid for, in the commodity each
 * cost in.
 */
const boughtAt = (id: string, { rows, base }: BoughtAtOptions) => {
	const priced = rows.filter((r) => r.cost !== base);
	const pairs = [...new Map(priced.map((r) => [`${r.cost} ${r.paid}`, r])).values()].map((r) => ({
		commodity: r.cost,
		day: r.paid,
	}));

	return DB.listRates(id, { pairs, base });
};

/**
 * All of history starts long before a ledger does, so it starts on the first
 * day these accounts moved. Fails for a span that runs backwards or covers more
 * than SPAN_MOST_DAYS.
 */
export const spanFrom = (id: string, span: Span, accounts: string[]): ResultAsync<Span> => {
	const reversed = reversedSpan(span);
	if (reversed) return errAsync(reversed);

	return DB.findFirstDelta(id, { accounts, to: span.to }).andThen((first) => {
		const long = longSpan(span, first);
		if (long) return errAsync(long);
		if (span.from.toString() !== BEGINNING) return okAsync(span);

		const none = first === null || Temporal.PlainDate.compare(first, span.to) > 0;

		return okAsync({ from: none ? span.to : first, to: span.to });
	});
};

type WorthParts = {
	parts: PartOf[];
	byCommodity: boolean;
	withLots?: Set<string>;
	alsoPriced?: string[];
};

/**
 * What worth is made of for these parts over a span, or null when they held
 * nothing in it.
 */
export const worthWalked = (
	id: string,
	span: Span,
	{ parts, byCommodity, withLots, alsoPriced = [] }: WorthParts,
): ResultAsync<WorthOfOptions | null> => {
	const accounts = parts.map((p) => p.accountId);

	return startOf(id, span, accounts).andThen((start) => {
		if (start === null) return okAsync(null);

		const to = span.to;
		const years = { from: start.year, to: to.year };

		return DB.listBalanceYears(id, { accounts, ...years }).andThen((all) => {
			const balances = withLots
				? all.filter((b) => withLots.has(`${b.accountId} ${b.commodity}`))
				: all;
			if (balances.length === 0) return okAsync(null);

			const commodities = [...new Set([...balances.map((b) => b.commodity), ...alsoPriced])];

			return DB.listPriceSources(id).andThen((sources) =>
				pricesWalked({
					id,
					start,
					years,
					sources,
					commodities,
					base: DEFAULT_COMMODITY,
					hops: HOPS,
				}).map(({ prices, opening }) => ({
					from: start,
					to,
					parts,
					byCommodity,
					balances,
					prices,
					sources,
					opening,
				})),
			);
		});
	});
};

/**
 * The day worth starts on, the later of the span's start and the first day
 * these accounts moved, or null when they had not moved by its end. Fails for a
 * span that runs backwards or covers more than SPAN_MOST_DAYS.
 */
const startOf = (
	id: string,
	{ from, to }: Span,
	accounts: string[],
): ResultAsync<Temporal.PlainDate | null> => {
	const reversed = reversedSpan({ from, to });
	if (reversed) return errAsync(reversed);

	return DB.findFirstDelta(id, { accounts, to }).andThen((first) => {
		const long = longSpan({ from, to }, first);
		if (long) return errAsync(long);
		if (first === null || Temporal.PlainDate.compare(first, to) > 0) return okAsync(null);

		return okAsync(Temporal.PlainDate.compare(first, from) > 0 ? first : from);
	});
};

type PricesWalkedOptions = {
	id: string;
	start: Temporal.PlainDate;
	years: { from: number; to: number };
	sources: PriceSources;
	commodities: string[];
	base: string;
	hops: number;
};

type PricesWalked = { prices: PriceYear[]; opening: Record<string, Quantity> };

/**
 * The price years and opening prices of these commodities and of the currencies
 * they are quoted in, as far as a commodity converts.
 */
const pricesWalked = ({
	commodities,
	base,
	hops,
	...o
}: PricesWalkedOptions): ResultAsync<PricesWalked> => {
	const asked = commodities.filter((c) => c !== base);
	if (hops === 0 || asked.length === 0) return okAsync({ prices: [], opening: {} });

	return ResultAsync.combine([
		DB.listPriceYears(symbolsOf(o.sources, asked), o.years),
		pricesBefore(o.id, o.start, asked),
	]).andThen(([prices, opening]) => {
		const quotedIn = [
			...prices.map((p) => p.priceCommodity),
			...Object.values(opening).map((p) => p.commodity),
		];
		const currencies = [...new Set(quotedIn)].filter((c) => !asked.includes(c));

		return pricesWalked({ ...o, commodities: currencies, base, hops: hops - 1 }).map((further) => ({
			prices: [...prices, ...further.prices],
			opening: { ...further.opening, ...opening },
		}));
	});
};

/**
 * Nothing is priced before all of history, whose day before Postgres cannot
 * write.
 */
const pricesBefore = (id: string, d: Temporal.PlainDate, c: string[]) =>
	d.toString() === BEGINNING
		? okAsync<Record<string, Quantity>>({})
		: DB.findLatestPrices(id, c, d.subtract({ days: 1 }));

const reversedSpan = ({ from, to }: Span): RupeaError | null =>
	Temporal.PlainDate.compare(from, to) > 0
		? fault('SpanReversed', { from: from.toString(), to: to.toString() })
		: null;

/**
 * Why a span is refused for covering more than SPAN_MOST_DAYS from the later of
 * its start and the first day with data, when there is one.
 */
const longSpan = ({ from, to }: Span, first: Temporal.PlainDate | null): RupeaError | null => {
	if (first === null || Temporal.PlainDate.compare(first, to) > 0) return null;

	const start = Temporal.PlainDate.compare(first, from) > 0 ? first : from;
	const days = start.until(to, { largestUnit: 'days' }).days + 1;

	return days > SPAN_MOST_DAYS ? fault('SpanTooLong', { days, most: SPAN_MOST_DAYS }) : null;
};

const unclosedSpan = ({ from, to }: Span, bucket: Bucket): RupeaError | null => {
	if (from.toString() === BEGINNING) return null;

	const days = from.until(to, { largestUnit: 'days' }).days;

	return bucket === 'date' && days > CLOSING_DAYS
		? fault('SpanTooLong', { days, most: CLOSING_DAYS })
		: null;
};
