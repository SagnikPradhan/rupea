import type { Batch } from '#lib/server/shared/result/batch.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import type { Quantity } from '../domain/amounts';
import { byAccount, HOPS, pricedIn, valued, type Account, type Holding } from '../domain/holdings';
import type { Ledger } from '../domain/types';
import { checkLots, syncIndex } from './sync';

export type { Account };
export type { LotHistory, Worth } from '../adapters/database';

type ListAccountsOptions = { ledger: Ledger; day: Temporal.PlainDate };

export const listAccounts = ({ ledger, day }: ListAccountsOptions): ResultAsync<Batch<Account>> =>
	syncIndex(ledger).andThen((failed) =>
		DB.listHoldings(ledger.id)
			.andThen((h) => valuedOn(ledger.id, day, h))
			.andThen((accounts) =>
				checkLots(ledger).map((unmatched) => ({
					succeeded: accounts,
					failed: [...failed, ...unmatched],
				})),
			),
	);

type ListWorthOptions = { ledger: Ledger; from: Temporal.PlainDate; to: Temporal.PlainDate };

/** What balance accounts were worth in rupees at the end of each day, from the ledger's first day at the earliest. */
export const listWorth = ({ ledger, from, to }: ListWorthOptions): ResultAsync<Batch<DB.Worth>> =>
	syncIndex(ledger).andThen((f) =>
		DB.listWorth(ledger.id, from, to).map((w) => ({ succeeded: w, failed: f })),
	);

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
