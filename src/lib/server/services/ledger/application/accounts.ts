import type { Batch } from '#lib/server/shared/result/batch.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { index, type LotHistory } from '../adapters/database';
import type { Quantity } from '../domain/amounts';
import { accountTree, HOPS, pricedIn, valued, type Account } from '../domain/holdings';
import type { Ledger } from '../domain/types';
import { checkLots, syncIndex, uncountedIn } from './sync';

export type { Account, LotHistory };

export const getAccounts = (l: Ledger, d: Temporal.PlainDate): ResultAsync<Batch<Account>> =>
	syncIndex(l).andThen((f) =>
		listValued(l.id, d).map((b) => ({ ...b, failed: [...f, ...b.failed] })),
	);

type GetLotsOptions = { ledger: Ledger; account: string; commodity: string };

export const getLots = (options: GetLotsOptions): ResultAsync<Batch<LotHistory>> => {
	const { ledger, account, commodity } = options;
	return syncIndex(ledger).andThen((f) =>
		index(ledger.id)
			.lotsIn({ account, commodity })
			.map((l) => ({ succeeded: l, failed: f })),
	);
};

const listValued = (ledgerId: string, day: Temporal.PlainDate): ResultAsync<Batch<Account>> =>
	uncountedIn(ledgerId)
		.andThen((e) => index(ledgerId).holdings(e))
		.andThen((hs) =>
			pricesOn({ ledgerId, day, commodities: pricedIn(hs) }).map((p) =>
				hs.map((h) => valued(h, p)),
			),
		)
		.andThen((v) => checkLots(ledgerId).map((u) => ({ succeeded: accountTree(v), failed: u })));

type PricesOnOptions = {
	ledgerId: string;
	day: Temporal.PlainDate;
	commodities: string[];
	hops?: number;
};

const pricesOn = (options: PricesOnOptions): ResultAsync<Record<string, Quantity>> => {
	const { ledgerId, day, commodities, hops = HOPS } = options;
	if (hops === 0 || commodities.length === 0) return okAsync({});

	return index(ledgerId)
		.latestPrices(commodities, day)
		.andThen((prices) => {
			const currencies = [...new Set(Object.values(prices).map((p) => p.commodity))];
			return pricesOn({ ledgerId, day, commodities: currencies, hops: hops - 1 }).map((f) => ({
				...f,
				...prices,
			}));
		});
};
