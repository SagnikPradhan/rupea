import { consistently } from '#lib/server/db/read-only.ts';
import { errAsync, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import type { AccountRow } from '@rupea/shared/account-tree.ts';
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
import { ASSETS, LIABILITIES } from '@rupea/shared/money.ts';
import * as DB from '../adapters/database';
import { DEFAULT_COMMODITY, sum, type Amount, type Quantity } from '../domain/amounts';
import { bridgeOf, type Bridge } from '../domain/bridge';
import { unpricedIn, type CostMove } from '../domain/cost';
import { balancesOf, type Balances, type Delta } from '../domain/deltas';
import { dropsOf, type Drops } from '../domain/drawdown';
import { HOPS, pricedIn, valued, type Holding } from '../domain/holdings';
import { type LotHistory } from '../domain/lots';
import { returnsOf, type Returns } from '../domain/returns';
import { INVESTMENT_INCOME } from '../domain/taxonomy';
import {
	accountsIn,
	idsIn,
	ownPartsIn,
	parentsIn,
	partsIn,
	type AccountNode,
} from '../domain/tree';
import { AccountType, type Ledger } from '../domain/types';
import {
	deltasOf,
	endingsOf,
	movesOf,
	symbolsOf,
	worthOf,
	type PartOf,
	type PriceSources,
	type PriceYear,
	type WorthOfOptions,
} from '../domain/worth';
import { checkLots } from './sync-after';

export type { LotHistory } from '../domain/lots';
export type { Balances, Bridge, Drops, Returns };

/**
 * The most days a span may cover, counted from the later of its start and the
 * first day with data, which is a hundred years.
 */
const SPAN_MOST_DAYS = 36_600;

type WorthParts = {
	parts: PartOf[];
	byCommodity: boolean;
	withLots?: Set<string>;
	alsoPriced?: string[];
};

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

/**
 * What worth is made of for these parts over a span, or null when they held
 * nothing in it.
 */
const worthWalked = (
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

type ListDropsOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account: string | null;
};

/**
 * How far the holdings with lots fell from their high at the end of each day,
 * and how far each account with lots did at its lowest, by the prices alone:
 * what was put in or taken out does not count. Nothing comes back for a span in
 * which no such holding was held.
 */
export const listDrops = ({
	ledger,
	from,
	to,
	account,
}: ListDropsOptions): ResultAsync<Batch<Drops>> =>
	consistently(() =>
		DB.listProblems(ledger.id).andThen((f) =>
			DB.listAccountTree(ledger.id)
				.andThen((t) => dropsOver(ledger.id, { from, to }, t, account))
				.map((d) => ({ succeeded: d === null ? [] : [d], failed: f })),
		),
	);

const dropsOver = (id: string, span: Span, tree: AccountNode[], account: string | null) => {
	const names = Object.fromEntries(tree.map((n) => [n.id, n.name]));
	const parts = partsIn(tree, account).parts.map((p) => ({
		accountId: p.accountId,
		part: names[p.accountId] ?? p.part,
	}));

	return DB.listCostMoves(id, { accounts: parts.map((p) => p.accountId), to: span.to }).andThen(
		(moves) => {
			const withLots = new Set(moves.map((m) => `${m.accountId} ${m.commodity}`));
			const lotted = parts.filter((p) => moves.some((m) => m.accountId === p.accountId));

			return worthWalked(id, span, { parts: lotted, byCommodity: false, withLots }).map((w) =>
				w === null
					? null
					: dropsOf(
							w.from,
							movesOf(w).filter((m) => m.asset),
						),
			);
		},
	);
};

type FindBridgeOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
};

/**
 * Why net worth went from the end of the span's first day, or the first day
 * anything was held, to its last: the income and expenses after that day, and
 * what prices did to each group of balances, valued as listBalances values
 * them, over every balance account, as income and expenses belong to the whole
 * ledger. Nothing comes back for a span in which nothing was held.
 */
export const findBridge = ({ ledger, from, to }: FindBridgeOptions): ResultAsync<Batch<Bridge>> =>
	consistently(() =>
		DB.listProblems(ledger.id).andThen((f) =>
			DB.listAccountTree(ledger.id)
				.andThen((t) => bridgeOver(ledger, { from, to }, t))
				.map((b) => ({ succeeded: b === null ? [] : [b], failed: f })),
		),
	);

const bridgeOver = (l: Ledger, span: Span, tree: AccountNode[]) => {
	const parts = [ASSETS, LIABILITIES].flatMap((r) => partsIn(tree, r).parts);

	return worthWalked(l.id, span, { parts, byCommodity: false }).andThen((w) => {
		const worth = w === null ? [] : worthOf(w);
		const start = worth[0];
		const end = worth.at(-1);
		if (w === null || !start || !end) return okAsync(null);

		const after = { from: start.day.add({ days: 1 }), to: span.to };
		const total = (a: string) =>
			Temporal.PlainDate.compare(after.from, after.to) > 0
				? okAsync(0n as Amount)
				: listBalances({ ledger: l, ...after, account: a, bucket: 'year' }).map((b) =>
						sum(
							(b.succeeded[0]?.rows ?? [])
								.filter((r) => r.account === a)
								.map((r) => r.value ?? (0n as Amount)),
						),
					);

		return ResultAsync.combine([total('Income'), total('Expenses')]).map(([income, expenses]) =>
			bridgeOf({
				from: start.day,
				to: end.day,
				start: start.worth,
				end: end.worth,
				income: -income as Amount,
				expenses,
				moves: movesOf(w),
			}),
		);
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

type ListReturnsOptions = { ledger: Ledger; from: Temporal.PlainDate; to: Temporal.PlainDate };

/**
 * What flowed into each Assets account over a span less what flowed out, and
 * its XIRR; failures are the ledger's problems and those of XIRR. Fails for a
 * span that runs backwards or covers more than SPAN_MOST_DAYS.
 */
export const listReturns = ({
	ledger,
	from,
	to,
}: ListReturnsOptions): ResultAsync<Batch<Returns>> =>
	consistently(() =>
		ResultAsync.combine([DB.listProblems(ledger.id), DB.listAccountTree(ledger.id)]).andThen(
			([failed, tree]) =>
				spanFrom(
					ledger.id,
					{ from, to },
					tree.map((n) => n.id),
				)
					.andThen((s) => returnsOver(ledger, s, tree))
					.map((r) => ({ succeeded: r.succeeded, failed: [...failed, ...r.failed] })),
		),
	);

const returnsOver = (ledger: Ledger, { from, to }: Span, tree: AccountNode[]) => {
	const earning = INVESTMENT_INCOME.flatMap((n) => idsIn(tree, n));
	const flows = DB.listFlows(ledger.id, { earning, from, to, base: DEFAULT_COMMODITY });

	return ResultAsync.combine([heldBefore(ledger.id, from), heldOn(ledger.id, to), flows]).map(
		([s, end, f]) => {
			const accounts = Object.keys(parentsIn(tree));
			const returns = returnsOf({ accounts, start: s, end, flows: f, span: { from, to } });

			return { succeeded: returns, failed: unsolvedIn(returns) };
		},
	);
};

/**
 * All of history starts long before a ledger does, so it starts on the first
 * day these accounts moved. Fails for a span that runs backwards or covers more
 * than SPAN_MOST_DAYS.
 */
const spanFrom = (id: string, span: Span, accounts: string[]): ResultAsync<Span> => {
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

type ListBalancesOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account?: string | undefined;
	bucket: Bucket;
	accumulate?: Accumulate;
	aggregate?: Aggregate;
	measures?: Measure[];
};

/** The field of an unreadable balances read that can be named, else measures. */
const unreadableFieldOf = (o: { accumulate: Accumulate; aggregate: Aggregate; bucket: Bucket }) => {
	if (o.aggregate === 'average' && o.bucket !== 'day') return 'aggregate';
	return o.accumulate === 'historical' && o.bucket === 'day' ? 'bucket' : 'measures';
};

/**
 * What an account and those under it, or every account, gained in the base over
 * a span, by each account drawn and the bucket its day falls in: a date, a day
 * of the month, a month or a year. A bucket the span comes to more than once is
 * summed or averaged, and only a day of the month does. Historical instead
 * gives what balance accounts were worth at the end of each bucket, from the
 * ledger's first day at the earliest, and with a cost the lots that match no
 * sale are failures. Fails for a span that runs backwards or covers more than
 * SPAN_MOST_DAYS, or more than CLOSING_DAYS by date.
 */
export const listBalances = ({
	ledger,
	from,
	to,
	account,
	bucket,
	accumulate = 'change',
	aggregate = 'sum',
	measures = ['value'],
}: ListBalancesOptions): ResultAsync<Batch<Balances>> =>
	consistently(() => {
		const long = unclosedSpan({ from, to }, bucket);
		if (long) return errAsync(long);

		return !isReadable({ accumulate, aggregate, bucket, measures })
			? errAsync(
					fault('InvalidRequest', {
						field: unreadableFieldOf({ accumulate, aggregate, bucket }),
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
						const deltas =
							accumulate === 'historical' ? historical(ledger.id, read) : changed(ledger.id, read);

						const checked =
							accumulate === 'historical' && measures.includes('cost')
								? checkLots(ledger, { accounts, to })
								: okAsync([] as RupeaError[]);

						return ResultAsync.combine([deltas, checked]).map(
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

const isRoot = (a: string) =>
	Object.values(AccountType).some((r) => r.toLowerCase() === a.toLowerCase());

type BalancesRead = {
	span: Span;
	tree: AccountNode[];
	accounts: string[];
	bucket: Bucket;
	measures: Measure[];
};

/** What the accounts gained in each bucket of the span. */
const changed = (id: string, { span, accounts, bucket }: BalancesRead) =>
	spanFrom(id, span, accounts).andThen((started) => {
		const long = unclosedSpan(started, bucket);
		if (long) return errAsync(long);

		return DB.listDeltas(id, { ...started, accounts, bucket, base: DEFAULT_COMMODITY }).map(
			(r) => ({ span: started, rows: r, faults: [] }),
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

/** A plain list of accounts, not a read, so it carries no failures. */
export const listAccounts = (l: Ledger): ResultAsync<AccountRow[]> =>
	DB.listAccountTree(l.id).map(accountsIn);

type ListLotsOptions = { ledger: Ledger; account: string; commodity: string };

export const listLots = ({
	ledger,
	account,
	commodity,
}: ListLotsOptions): ResultAsync<Batch<LotHistory>> =>
	DB.listProblems(ledger.id).andThen((f) =>
		DB.listLots(ledger.id, { account, commodity }).map((l) => ({ succeeded: l, failed: f })),
	);

const heldOn = (id: string, d: Temporal.PlainDate) =>
	DB.listHoldings(id, d).andThen((h) => valuedOn(id, d, h));

/**
 * Nothing is held before all of history, whose day before Postgres cannot
 * write.
 */
const heldBefore = (id: string, d: Temporal.PlainDate) =>
	d.toString() === BEGINNING ? okAsync([]) : heldOn(id, d.subtract({ days: 1 }));

/**
 * Each account whose XIRR could not be worked out, unless one under it could
 * not either.
 */
const unsolvedIn = (returns: Returns[]): RupeaError[] => {
	const failed = returns.filter((r) => r.xirr === null);
	const deepest = failed.filter((r) => !failed.some((o) => o.account.startsWith(`${r.account}:`)));

	return deepest.map((r) =>
		r.unpriced > 0
			? fault('ReturnUnpriced', { account: r.account, unpriced: r.unpriced })
			: fault('ReturnUnsolved', { account: r.account }),
	);
};

const valuedOn = (id: string, d: Temporal.PlainDate, h: Holding[]) =>
	pricesOn({ ledgerId: id, day: d, commodities: pricedIn(h), hops: HOPS }).map((p) =>
		h.map((x) => valued(x, p)),
	);

type PricesOnOptions = {
	ledgerId: string;
	day: Temporal.PlainDate;
	commodities: string[];
	hops: number;
};

const pricesOn = ({
	ledgerId,
	day,
	commodities,
	hops,
}: PricesOnOptions): ResultAsync<Record<string, Quantity>> => {
	if (hops === 0 || commodities.length === 0) return okAsync({});

	return DB.findLatestPrices(ledgerId, commodities, day).andThen((prices) => {
		const currencies = [...new Set(Object.values(prices).map((p) => p.commodity))];
		return pricesOn({ ledgerId, day, commodities: currencies, hops: hops - 1 }).map((further) => ({
			...further,
			...prices,
		}));
	});
};
