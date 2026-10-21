import { replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import { Day, Range, startOf } from '#lib/shared/dates.ts';
import { formatAmount, formatQuantity } from '#services/ledger/application/shared.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger } from './shared';

const AccountsQuery = v.object({ handle: Handle, day: Day });
const WorthQuery = v.object({ handle: Handle, range: Range, day: Day });
const LotsQuery = v.object({ handle: Handle, account: v.string(), commodity: v.string() });

export const getAccounts = query(AccountsQuery, async ({ handle, day }) => {
	const accounts = inLedger({ handle, action: (l) => Accounts.getAccounts(l, day) });

	return replyFromBatch(
		await accounts.map((b) => ({ ...b, succeeded: b.succeeded.map(viewAccount) })),
	);
});

export const getWorth = query(WorthQuery, async ({ handle, range, day }) => {
	const worth = inLedger({
		handle,
		action: (l) => Accounts.getWorth({ ledger: l, from: startOf[range](day), to: day }),
	});

	return replyFromBatch(await worth.map((b) => ({ ...b, succeeded: b.succeeded.map(viewWorth) })));
});

export const getLots = query(LotsQuery, async ({ handle, account, commodity }) => {
	const lots = inLedger({
		handle,
		action: (l) => Accounts.getLots({ ledger: l, account, commodity }),
	});

	return replyFromBatch(await lots.map((b) => ({ ...b, succeeded: b.succeeded.map(viewLot) })));
});

const viewAccount = (account: Accounts.Account) => ({
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

const viewWorth = (worth: Accounts.Worth) => ({
	day: worth.day.toString(),
	assets: formatAmount(worth.assets),
	liabilities: formatAmount(worth.liabilities),
	worth: formatAmount(worth.worth),
	unpriced: worth.unpriced,
});

const viewLot = (lot: Accounts.LotHistory) => ({
	file: lot.location.file,
	line: lot.location.line,
	date: lot.date.toString(),
	origin: lot.origin,
	from: lot.from,
	units: formatAmount(lot.units),
	remaining: formatAmount(lot.remaining),
	cost: formatQuantity(lot.cost),
	disposals: lot.disposals.map((disposal) => ({
		file: disposal.location.file,
		line: disposal.location.line,
		date: disposal.date.toString(),
		kind: disposal.kind,
		units: formatAmount(disposal.units),
		price: disposal.price && formatQuantity(disposal.price),
		gain: disposal.gain && formatQuantity(disposal.gain),
	})),
});
