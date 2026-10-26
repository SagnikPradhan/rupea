import type { Batch } from '#lib/server/shared/result/batch.ts';
import { okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Bucket, Span } from '#lib/shared/dates.ts';
import * as DB from '../adapters/database';
import type { Quantity } from '../domain/amounts';
import { byAccount, HOPS, pricedIn, valued, type Account, type Holding } from '../domain/holdings';
import { spendingOf, type Spending } from '../domain/spending';
import type { Ledger } from '../domain/types';
import { checkLots, syncIndex } from './sync';

export type { Account };
export type { LotHistory, Worth } from '../adapters/database';
export type { Spending };

type ListAccountsOptions = { ledger: Ledger; day: Temporal.PlainDate };

/** What each balance account held at the end of a day, valued at that day's prices. */
export const listAccounts = ({ ledger, day }: ListAccountsOptions): ResultAsync<Batch<Account>> =>
	syncIndex(ledger).andThen((failed) =>
		DB.listHoldings(ledger.id, day)
			.andThen((h) => valuedOn(ledger.id, day, h))
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

/** What balance accounts were worth in rupees at the end of each day, from the ledger's first day at the earliest. */
export const listWorth = ({
	ledger,
	from,
	to,
	account,
}: ListWorthOptions): ResultAsync<Batch<DB.Worth>> =>
	syncIndex(ledger).andThen((f) =>
		DB.listWorth(ledger.id, { from, to, account }).map((w) => ({
			succeeded: w,
			failed: f,
		})),
	);

type ListSpendingOptions = { ledger: Ledger; spans: Span[]; bucket: Bucket; account: string };

/** What an Expenses account and those under it gained in rupees over each span, one spending per span. */
export const listSpending = ({
	ledger,
	spans,
	bucket,
	account,
}: ListSpendingOptions): ResultAsync<Batch<Spending>> => {
	const spending = (s: Span) =>
		DB.listSpending(ledger.id, { ...s, bucket, account }).map((r) => spendingOf(r, s, bucket));

	return syncIndex(ledger).andThen((f) =>
		ResultAsync.combine(spans.map(spending)).map((s) => ({ succeeded: s, failed: f })),
	);
};

type ListLotsOptions = { ledger: Ledger; account: string; commodity: string };

export const listLots = ({
	ledger,
	account,
	commodity,
}: ListLotsOptions): ResultAsync<Batch<DB.LotHistory>> =>
	syncIndex(ledger).andThen((f) =>
		DB.listLots(ledger.id, { account, commodity }).map((l) => ({ succeeded: l, failed: f })),
	);

const valuedOn = (id: string, d: Temporal.PlainDate, h: Holding[]) =>
	pricesOn({ ledgerId: id, day: d, commodities: pricedIn(h), hops: HOPS }).map((p) =>
		byAccount(h.map((x) => valued(x, p))),
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
