import { consistently } from '#lib/server/db/read-only.ts';
import { okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import type { AccountRow } from '@rupea/shared/account-tree.ts';
import { BEGINNING, type Span } from '@rupea/shared/dates.ts';
import { fault, type Batch, type RupeaError } from '@rupea/shared/errors.ts';
import { ASSETS, LIABILITIES } from '@rupea/shared/money.ts';
import * as DB from '../adapters/database';
import { DEFAULT_COMMODITY, sum, type Amount, type Quantity } from '../domain/amounts';
import { bridgeOf, type Bridge } from '../domain/bridge';
import { type Balances } from '../domain/deltas';
import { dropsOf, type Drops } from '../domain/drawdown';
import { HOPS, pricedIn, valued, type Holding } from '../domain/holdings';
import { type LotHistory } from '../domain/lots';
import { returnsOf, type Returns } from '../domain/returns';
import { INVESTMENT_INCOME } from '../domain/taxonomy';
import { accountsIn, idsIn, parentsIn, partsIn, type AccountNode } from '../domain/tree';
import { type Ledger } from '../domain/types';
import { movesOf, shiftsOf, worthOn } from '../domain/worth';
import { listDeltas, spanFrom, worthWalked } from './deltas';

export type { LotHistory } from '../domain/lots';
export type { Balances, Bridge, Drops, Returns };

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
 * what prices did to each group of balances, valued as the deltas read values
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
		if (w === null) return okAsync(null);

		const after = { ledger: l, from: w.from.add({ days: 1 }), to: w.to };

		return ResultAsync.combine([
			findTotal({ ...after, account: 'Income' }),
			findTotal({ ...after, account: 'Expenses' }),
		]).map(([income, expenses]) =>
			bridgeOf({
				from: w.from,
				to: w.to,
				start: worthOn(w, w.from).worth,
				end: worthOn(w, w.to).worth,
				income: -income as Amount,
				expenses,
				shifts: shiftsOf(w),
			}),
		);
	});
};

type FindTotalOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account: string;
};

const findTotal = ({ account, ...options }: FindTotalOptions) =>
	Temporal.PlainDate.compare(options.from, options.to) > 0
		? okAsync(0n as Amount)
		: listDeltas({ ...options, account, bucket: 'year' }).map((b) =>
				sum(
					(b.succeeded[0]?.rows ?? [])
						.filter((r) => r.account === account)
						.map((r) => r.value ?? (0n as Amount)),
				),
			);

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
