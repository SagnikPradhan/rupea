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
import { unpricedIn, type CostMove } from '../domain/cost';
import { balancesOf, type Balances, type Delta } from '../domain/deltas';
import { EVERYTHING, type Filter } from '../domain/filters';
import { HOPS } from '../domain/holdings';
import { idsIn, ownPartsIn, parentsIn, type AccountNode } from '../domain/tree';
import { AccountType, type Ledger } from '../domain/types';
import {
	deltasOf,
	endingsOf,
	symbolsOf,
	type PartOf,
	type PriceSources,
	type PriceYear,
	type WorthOfOptions,
} from '../domain/worth';
import { checkLots } from './sync-after';

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
		const long = unclosedSpan({ from, to }, bucket);
		if (long) return errAsync(long);

		return !isReadable({ accumulate: 'change', aggregate, bucket, measures })
			? errAsync(
					fault('InvalidRequest', {
						field: unreadableFieldOf({ accumulate: 'change', aggregate, bucket }),
						reason: 'unreadable',
					}),
				)
			: ResultAsync.combine([DB.listProblems(ledger.id), DB.listAccountTree(ledger.id)]).andThen(
					([failed, tree]) => {
						const accounts = account === undefined ? tree.map((n) => n.id) : idsIn(tree, account);
						if (account !== undefined && !accounts.length && !isRoot(account))
							return errAsync(fault('AccountNotFound', { account }));

						const base = DEFAULT_COMMODITY;
						const read = { span: { from, to }, tree, accounts, filter, bucket, measures };

						return changed(ledger.id, read).map(({ span, rows }) => {
							const parents = parentsIn(tree);
							const balances = balancesOf(rows, {
								span,
								base,
								bucket,
								aggregate,
								measures,
								parents,
							});
							return { succeeded: [balances], failed };
						});
					},
				);
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
 * the ledger's first day at the earliest, and with a cost the lots that match
 * no sale are failures. Fails for a span that runs backwards or covers more
 * than SPAN_MOST_DAYS, or more than CLOSING_DAYS by date.
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
		const long = unclosedSpan({ from, to }, bucket);
		if (long) return errAsync(long);

		return !isReadable({ accumulate: 'historical', aggregate, bucket, measures })
			? errAsync(
					fault('InvalidRequest', {
						field: unreadableFieldOf({ accumulate: 'historical', aggregate, bucket }),
						reason: 'unreadable',
					}),
				)
			: ResultAsync.combine([DB.listProblems(ledger.id), DB.listAccountTree(ledger.id)]).andThen(
					([failed, tree]) => {
						const accounts = account === undefined ? tree.map((n) => n.id) : idsIn(tree, account);
						if (account !== undefined && !accounts.length && !isRoot(account))
							return errAsync(fault('AccountNotFound', { account }));

						const base = DEFAULT_COMMODITY;
						const read = { span: { from, to }, tree, accounts, bucket, measures };

						const checked = measures.includes('cost')
							? checkLots(ledger, { accounts, to })
							: okAsync([] as RupeaError[]);

						return ResultAsync.combine([historical(ledger.id, read), checked]).map(
							([{ span, rows, faults }, unmatched]) => {
								const parents = parentsIn(tree);
								const balances = balancesOf(rows, {
									span,
									base,
									bucket,
									aggregate,
									measures,
									parents,
								});
								return { succeeded: [balances], failed: [...failed, ...faults, ...unmatched] };
							},
						);
					},
				);
	});

/** The field of an unreadable balances read that can be named, else measures. */
const unreadableFieldOf = (o: { accumulate: Accumulate; aggregate: Aggregate; bucket: Bucket }) => {
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
};

/** What the accounts gained in each bucket of the span. */
const changed = (id: string, { span, accounts, filter = EVERYTHING, bucket }: BalancesRead) =>
	spanFrom(id, span, accounts).andThen((started) => {
		const long = unclosedSpan(started, bucket);
		if (long) return errAsync(long);

		return DB.listDeltas(id, { ...started, accounts, filter, bucket, base: DEFAULT_COMMODITY }).map(
			(r) => ({ span: started, rows: r }),
		);
	});

/**
 * What the balance accounts held at the end of each bucket of the span: the
 * units of each commodity, what they were worth, what their lots cost at that
 * day's prices and the price of a unit.
 */
const historical = (id: string, read: BalancesRead) => {
	const { span, tree, accounts, measures } = read;
	const bucket = read.bucket as 'date' | 'month' | 'year';
	const asked = { from: span.from.toString() === BEGINNING ? span.to : span.from, to: span.to };
	const spanOf = (w: WorthOfOptions | null): Span => (w ? { from: w.from, to: w.to } : asked);

	const parts = ownPartsIn(tree, accounts);
	const paid = measures.includes('paid');
	const costMoves =
		paid || measures.includes('cost')
			? DB.listCostMovesFrom(id, {
					accounts: parts.map((p) => p.accountId),
					from: span.from,
					to: span.to,
				})
			: okAsync([] as CostMove[]);

	return costMoves.andThen((moves) =>
		boughtAt(id, paid ? moves : []).andThen((bought) => {
			const costs = [...new Set(moves.map((m) => m.cost))];
			const alsoPriced = costs.filter((c) => c !== DEFAULT_COMMODITY);
			const faults = (paid ? unpricedIn(moves, bought) : []).map((c) =>
				fault('CostUnpriced', { commodity: c }),
			);

			return worthWalked(id, span, { parts, byCommodity: false, alsoPriced }).andThen((w) => {
				const long = w && unclosedSpan(w, bucket);
				if (long) return errAsync(long);
				if (w === null) return okAsync({ span: spanOf(w), rows: [] as Delta[], faults });

				const endings = endingsOf(w, { days: endsIn(w, bucket), lots: moves, bought, paid });
				const rows = deltasOf(endings, bucket);

				return okAsync({ span: spanOf(w), rows, faults });
			});
		}),
	);
};

/**
 * The prices in rupees of the days lots were paid for, in the commodity each
 * cost in.
 */
const boughtAt = (id: string, moves: CostMove[]) => {
	const priced = moves.filter((m) => m.cost !== DEFAULT_COMMODITY);
	const pairs = [...new Map(priced.map((m) => [`${m.cost} ${m.paid}`, m])).values()].map((m) => ({
		commodity: m.cost,
		day: m.paid,
	}));

	return DB.listRates(id, { pairs, base: DEFAULT_COMMODITY });
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
	{ from, to }: Span,
	{ parts, byCommodity, withLots, alsoPriced = [] }: WorthParts,
): ResultAsync<WorthOfOptions | null> => {
	const reversed = reversedSpan({ from, to });
	if (reversed) return errAsync(reversed);

	return DB.findFirstDelta(id, { accounts: parts.map((p) => p.accountId), to }).andThen((first) => {
		const long = longSpan({ from, to }, first);
		if (long) return errAsync(long);
		if (first === null || Temporal.PlainDate.compare(first, to) > 0) return okAsync(null);

		const start = Temporal.PlainDate.compare(first, from) > 0 ? first : from;
		const years = { from: start.year, to: to.year };
		const accounts = parts.map((p) => p.accountId);

		return DB.listBalanceYears(id, { accounts, ...years }).andThen((all) => {
			const balances = withLots
				? all.filter((b) => withLots.has(`${b.accountId} ${b.commodity}`))
				: all;
			if (balances.length === 0) return okAsync(null);

			const commodities = [...new Set([...balances.map((b) => b.commodity), ...alsoPriced])];

			return DB.listPriceSources(id).andThen((sources) =>
				pricesWalked({ id, start, years, sources, commodities, hops: HOPS }).map(
					({ prices, opening }) => ({
						from: start,
						to,
						parts,
						byCommodity,
						balances,
						prices,
						sources,
						opening,
					}),
				),
			);
		});
	});
};

type PricesWalkedOptions = {
	id: string;
	start: Temporal.PlainDate;
	years: { from: number; to: number };
	sources: PriceSources;
	commodities: string[];
	hops: number;
};

type PricesWalked = { prices: PriceYear[]; opening: Record<string, Quantity> };

/**
 * The price years and opening prices of these commodities and of the currencies
 * they are quoted in, as far as a commodity converts.
 */
const pricesWalked = ({
	commodities,
	hops,
	...o
}: PricesWalkedOptions): ResultAsync<PricesWalked> => {
	const asked = commodities.filter((c) => c !== DEFAULT_COMMODITY);
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

		return pricesWalked({ ...o, commodities: currencies, hops: hops - 1 }).map((further) => ({
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
