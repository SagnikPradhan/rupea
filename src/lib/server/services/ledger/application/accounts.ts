import type { Batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { BEGINNING, type Bucket, type Span } from '#lib/shared/dates.ts';
import * as DB from '../adapters/database';
import type { Quantity } from '../domain/amounts';
import { byAccount, HOPS, pricedIn, valued, type Account, type Holding } from '../domain/holdings';
import { returnsOf, type Returns } from '../domain/returns';
import { spendingOf, type Spending } from '../domain/spending';
import { parentsIn, partsIn } from '../domain/tree';
import type { Ledger } from '../domain/types';
import { checkLots } from './sync';

export type { Account };
export type { LotHistory, Worth } from '../adapters/database';
export type { Returns, Spending };

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
			.andThen((t) => DB.listWorth(ledger.id, { from, to, ...partsIn(t, account) }))
			.map((w) => ({ succeeded: w, failed: f })),
	);

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

type ListAccountNamesOptions = { ledger: Ledger; prefix: string };

export const listAccountNames = ({
	ledger,
	prefix,
}: ListAccountNamesOptions): ResultAsync<string[]> => DB.listAccountNames(ledger.id, prefix);

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
