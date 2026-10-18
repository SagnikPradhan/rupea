import { replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import {
	displayLocation,
	formatAmount,
	formatQuantity,
} from '#services/ledger/application/shared.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger } from './shared';

const LotsQuery = v.object({ handle: Handle, account: v.string(), commodity: v.string() });

export const getAccounts = query(Handle, async (handle) => {
	const today = Temporal.Now.plainDateISO();
	const accounts = inLedger({ handle, action: (l) => Ledger.getAccounts(l, today) });

	return replyFromBatch(
		await accounts.map((b) => ({ ...b, succeeded: b.succeeded.map(viewAccount) })),
	);
});

export const getLots = query(LotsQuery, async ({ handle, account, commodity }) => {
	const lots = inLedger({
		handle,
		action: (l) => Ledger.getLots({ ledger: l, account, commodity }),
	});

	return replyFromBatch(await lots.map((b) => ({ ...b, succeeded: b.succeeded.map(viewLot) })));
});

const viewAccount = (account: Ledger.Account) => ({
	...account,
	total: formatAmount(account.total),
	holdings: account.holdings.map((holding) => ({
		commodity: holding.commodity,
		hasLots: holding.hasLots,
		units: formatQuantity({ amount: holding.units, commodity: holding.commodity }),
		cost: holding.cost && formatQuantity(holding.cost),
		price: holding.price && formatQuantity(holding.price),
		value: holding.value === null ? null : formatAmount(holding.value),
		gain: holding.gain === null ? null : formatAmount(holding.gain),
	})),
});

const viewLot = (lot: Ledger.LotHistory) => ({
	location: displayLocation(lot.location),
	date: lot.date.toString(),
	origin: lot.origin,
	from: lot.from,
	units: formatAmount(lot.units),
	remaining: formatAmount(lot.remaining),
	cost: formatQuantity(lot.cost),
	disposals: lot.disposals.map((disposal) => ({
		location: displayLocation(disposal.location),
		date: disposal.date.toString(),
		kind: disposal.kind,
		units: formatAmount(disposal.units),
		price: disposal.price && formatQuantity(disposal.price),
		gain: disposal.gain && formatQuantity(disposal.gain),
	})),
});
