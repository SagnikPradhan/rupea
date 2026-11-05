import type { Batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { ASSETS, LIABILITIES } from '#lib/shared/accounts.ts';
import { BEGINNING, type Bucket, type Span } from '#lib/shared/dates.ts';
import * as DB from '../adapters/database';
import { DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import { costOn, unpricedIn } from '../domain/cost';
import { bridgeOf, type Bridge } from '../domain/bridge';
import { dropsOf, type Drops } from '../domain/drawdown';
import { byAccount, HOPS, pricedIn, valued, type Account, type Holding } from '../domain/holdings';
import { returnsOf, type Returns } from '../domain/returns';
import { spendingOf, type Spending } from '../domain/spending';
import { parentsIn, partsIn, type AccountNode } from '../domain/tree';
import type { Ledger } from '../domain/types';
import {
	movesOf,
	symbolsOf,
	worthOf,
	type PriceSources,
	type PriceYear,
	type WorthOfOptions,
} from '../domain/worth';
import { checkLots } from './sync';

export type { Account };
export type { LotHistory, Worth } from '../adapters/database';
export type { Bridge, Drops, Returns, Spending };

type ListAccountsOptions = { ledger: Ledger; day: Temporal.PlainDate };

/** What each balance account held at the end of a day, valued at that day's prices. */
export const listAccounts = ({ ledger, day }: ListAccountsOptions): ResultAsync<Batch<Account>> =>
	DB.listProblems(ledger.id).andThen((failed) =>
		ResultAsync.combine([DB.listHoldings(ledger.id, day), DB.listAccountTree(ledger.id)])
			.andThen(([h, tree]) => valuedOn(ledger.id, day, h).map((v) => byAccount(v, parentsIn(tree))))
			.andThen((accounts) =>
				checkLots(ledger).map((unmatched) => ({
					succeeded: accounts,
					failed: [...failed, ...unmatched],
				})),
			),
	);

type ListWorthOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	/** Narrows the balances to an account and those under it; every balance account without one. */
	account: string | null;
};

/** What balance accounts were worth in rupees at the end of each day, from the ledger's first day at the earliest, divided into the parts partsIn picks. */
export const listWorth = ({
	ledger,
	from,
	to,
	account,
}: ListWorthOptions): ResultAsync<Batch<DB.Worth>> =>
	DB.listProblems(ledger.id).andThen((f) =>
		DB.listAccountTree(ledger.id)
			.andThen((t) => worthOver(ledger.id, { from, to }, partsIn(t, account)))
			.map((w) => ({ succeeded: w, failed: f })),
	);

type WorthParts = {
	parts: DB.PartOf[];
	byCommodity: boolean;
	/** Counts only these account and commodity pairs, written as the account's id, a space and the commodity. */
	held?: Set<string>;
};

/** Worth from the later of a span's start and the first day the parts held anything, or none before a sync has built the ledger's years. */
const worthOver = (id: string, s: Span, p: WorthParts): ResultAsync<DB.Worth[]> =>
	walked(id, s, p).map((w) => (w === null ? [] : worthOf(w)));

/** What worth is made of for these parts over a span, or null when they held nothing in it. */
const walked = (
	id: string,
	{ from, to }: Span,
	{ parts, byCommodity, held }: WorthParts,
): ResultAsync<WorthOfOptions | null> =>
	DB.findFirstHeld(id, { parts, to }).andThen((first) => {
		if (first === null || Temporal.PlainDate.compare(first, to) > 0) return okAsync(null);

		const start = Temporal.PlainDate.compare(first, from) > 0 ? first : from;
		const years = { from: start.year, to: to.year };
		const accounts = parts.map((p) => p.accountId);

		return DB.listBalanceYears(id, { accounts, ...years }).andThen((all) => {
			const balances = held ? all.filter((b) => held.has(`${b.accountId} ${b.commodity}`)) : all;
			if (balances.length === 0) return okAsync(null);

			const commodities = [...new Set(balances.map((b) => b.commodity))];

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

export type Invested = { day: Temporal.PlainDate; value: Amount; cost: Amount };

type ListInvestedOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	/** Narrows the lots to an account and those under it; every account with lots without one. */
	account: string | null;
};

/**
 * What the holdings with lots in an account and those under it were worth in rupees at the end of
 * each day, as listWorth values them, beside what their lots had cost, each at the price of the
 * day it was taken in. A sale takes the cost of the lots it sold out, not what it fetched.
 */
export const listInvested = ({
	ledger,
	from,
	to,
	account,
}: ListInvestedOptions): ResultAsync<Batch<Invested>> =>
	DB.listProblems(ledger.id).andThen((f) =>
		DB.listAccountTree(ledger.id)
			.andThen((t) => investedOver(ledger.id, { from, to }, partsIn(t, account).parts))
			.map(({ days, unpriced }) => ({
				succeeded: days,
				failed: [...f, ...unpriced.map((c) => fault('CostUnpriced', { commodity: c }))],
			})),
	);

const investedOver = (id: string, { from, to }: Span, parts: DB.PartOf[]) =>
	DB.listCostMoves(id, { accounts: parts.map((p) => p.accountId), to }).andThen((moves) => {
		const held = new Set(moves.map((m) => `${m.accountId} ${m.commodity}`));
		const lotted = parts.filter((p) => moves.some((m) => m.accountId === p.accountId));
		const priced = moves.filter((m) => m.cost !== DEFAULT_COMMODITY);
		const pairs = [...new Map(priced.map((m) => [`${m.cost} ${m.day}`, m])).values()].map((m) => ({
			commodity: m.cost,
			day: m.day,
		}));

		return ResultAsync.combine([
			worthOver(id, { from, to }, { parts: lotted, byCommodity: false, held }),
			DB.listRatesThen(id, pairs),
		]).map(([worth, rates]) => {
			const costs = costOn({ moves, rates, days: worth.map((w) => w.day) });
			const days = worth.map((w, i) => ({
				day: w.day,
				value: w.worth,
				cost: costs[i] ?? (0n as Amount),
			}));

			return { days, unpriced: unpricedIn(moves, rates) };
		});
	});

type ListDropsOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	/** Narrows the lots to an account and those under it; every account with lots without one. */
	account: string | null;
};

/**
 * How far the holdings with lots fell from their high at the end of each day, and how far each
 * account with lots did at its lowest, by the prices alone: what was put in or taken out does not
 * count. Nothing comes back for a span in which no such holding was held.
 */
export const listDrops = ({
	ledger,
	from,
	to,
	account,
}: ListDropsOptions): ResultAsync<Batch<Drops>> =>
	DB.listProblems(ledger.id).andThen((f) =>
		DB.listAccountTree(ledger.id)
			.andThen((t) => dropsOver(ledger.id, { from, to }, t, account))
			.map((d) => ({ succeeded: d === null ? [] : [d], failed: f })),
	);

const dropsOver = (id: string, span: Span, tree: AccountNode[], account: string | null) => {
	const names = Object.fromEntries(tree.map((n) => [n.id, n.name]));
	const parts = partsIn(tree, account).parts.map((p) => ({
		accountId: p.accountId,
		part: names[p.accountId] ?? p.part,
	}));

	return DB.listCostMoves(id, { accounts: parts.map((p) => p.accountId), to: span.to }).andThen(
		(moves) => {
			const held = new Set(moves.map((m) => `${m.accountId} ${m.commodity}`));
			const lotted = parts.filter((p) => moves.some((m) => m.accountId === p.accountId));

			return walked(id, span, { parts: lotted, byCommodity: false, held }).map((w) =>
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
 * Why net worth went from the end of the span's first day, or the first day anything was held, to
 * its last: the income and expenses after that day, and what prices did to each group of balances,
 * valued as listWorth values them, over every balance account, as income and expenses belong to
 * the whole ledger. Nothing comes back for a span in which nothing was held.
 */
export const findBridge = ({ ledger, from, to }: FindBridgeOptions): ResultAsync<Batch<Bridge>> =>
	DB.listProblems(ledger.id).andThen((f) =>
		DB.listAccountTree(ledger.id)
			.andThen((t) => bridgeOver(ledger, { from, to }, t))
			.map((b) => ({ succeeded: b === null ? [] : [b], failed: f })),
	);

const bridgeOver = (l: Ledger, span: Span, tree: AccountNode[]) => {
	const parts = [ASSETS, LIABILITIES].flatMap((r) => partsIn(tree, r).parts);

	return walked(l.id, span, { parts, byCommodity: false }).andThen((w) => {
		const worth = w === null ? [] : worthOf(w);
		const start = worth[0];
		const end = worth.at(-1);
		if (w === null || !start || !end) return okAsync(null);

		const after = { from: start.day.add({ days: 1 }), to: span.to };
		const total = (a: string) =>
			Temporal.PlainDate.compare(after.from, after.to) > 0
				? okAsync(0n as Amount)
				: listSpending({ ledger: l, spans: [after], bucket: 'month', account: a }).map(
						(b) => b.succeeded[0]?.totals.find((t) => t.account === a)?.amount ?? (0n as Amount),
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

/** The price years and opening prices of these commodities and of the currencies they are quoted in, as far as a commodity converts. */
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

/** Nothing is priced before all of history, whose day before Postgres cannot write. */
const pricesBefore = (id: string, d: Temporal.PlainDate, c: string[]) =>
	d.toString() === BEGINNING
		? okAsync<Record<string, Quantity>>({})
		: DB.findLatestPrices(id, c, d.subtract({ days: 1 }));

type ListReturnsOptions = { ledger: Ledger; from: Temporal.PlainDate; to: Temporal.PlainDate };

/** What flowed into each Assets account over a span less what flowed out, and its XIRR; failures are only those of XIRR, as accounts report the rest. */
export const listReturns = ({
	ledger,
	from,
	to,
}: ListReturnsOptions): ResultAsync<Batch<Returns>> =>
	ResultAsync.combine([
		heldBefore(ledger.id, from),
		heldOn(ledger.id, to),
		DB.listFlows(ledger.id, { from, to }),
		DB.listAccountTree(ledger.id),
	]).map(([s, end, flows, tree]) => {
		const accounts = Object.keys(parentsIn(tree));
		const returns = returnsOf({ accounts, start: s, end, flows, span: { from, to } });

		return { succeeded: returns, failed: unsolvedIn(returns) };
	});

type ListSpendingOptions = { ledger: Ledger; spans: Span[]; bucket: Bucket; account: string };

/** What an Expenses account and those under it gained in rupees over each span, one spending per span. */
export const listSpending = ({
	ledger,
	spans,
	bucket,
	account,
}: ListSpendingOptions): ResultAsync<Batch<Spending>> => {
	const spending = (s: Span, p: Record<string, string | null>) =>
		DB.listSpending(ledger.id, { ...s, bucket, account }).map((r) =>
			spendingOf(r, { span: s, bucket, parents: p }),
		);

	return DB.listProblems(ledger.id).andThen((f) =>
		DB.listAccountTree(ledger.id)
			.map(parentsIn)
			.andThen((p) => ResultAsync.combine(spans.map((s) => spending(s, p))))
			.map((s) => ({ succeeded: s, failed: f })),
	);
};

/** Every account, each with the one it is drawn under, as parentsIn divides them. */
export const listAccountTree = (
	l: Ledger,
): ResultAsync<{ account: string; parent: string | null }[]> =>
	DB.listAccountTree(l.id).map((t) =>
		Object.entries(parentsIn(t)).map(([account, parent]) => ({ account, parent })),
	);

type ListLotsOptions = { ledger: Ledger; account: string; commodity: string };

export const listLots = ({
	ledger,
	account,
	commodity,
}: ListLotsOptions): ResultAsync<Batch<DB.LotHistory>> =>
	DB.listProblems(ledger.id).andThen((f) =>
		DB.listLots(ledger.id, { account, commodity }).map((l) => ({ succeeded: l, failed: f })),
	);

const heldOn = (id: string, d: Temporal.PlainDate) =>
	DB.listHoldings(id, d).andThen((h) => valuedOn(id, d, h));

/** Nothing is held before all of history, whose day before Postgres cannot write. */
const heldBefore = (id: string, d: Temporal.PlainDate) =>
	d.toString() === BEGINNING ? okAsync([]) : heldOn(id, d.subtract({ days: 1 }));

/** Each account whose XIRR could not be worked out, unless one under it could not either. */
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
