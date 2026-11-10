import type { RupeaError } from '@rupea/shared/error.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { BEGINNING, coverOf } from '@rupea/shared/dates.ts';
import * as DB from '../adapters/database';
import { checkGroups } from '../domain/groups';
import { UNTOUCHED, type Indexed, type Settling } from './sync-index';

type SettleOptions = { ledgerId: string; indexed: Indexed };

/**
 * Settles what spans files once indexed: which transactions count, then the
 * lots, months and assertions they and the recount touched, and the accounts
 * left unused.
 */
export const settle = ({ ledgerId, indexed }: SettleOptions): ResultAsync<RupeaError[]> =>
	recount(ledgerId, indexed.grouped)
		.andThen((r) => settleTouched(ledgerId, merged(indexed, r)))
		.map(() => indexed.failed);

/**
 * Settles as settle does, but over everything, since what reading a file did
 * not touch may be what is wrong.
 */
export const settleAll = (id: string): ResultAsync<void> =>
	recount(id, true).andThen(() => settleEverything(id));

const merged = (i: Indexed, r: DB.Touched): Settling => ({
	commodities: [...i.commodities, ...r.commodities],
	span: coverOf([...i.spans, ...r.spans]),
	holdings: [...i.holdings, ...r.holdings],
});

const settleTouched = (id: string, t: Settling): ResultAsync<void> =>
	rebook(id, t)
		.andThen(() => saveMonths(id, t))
		.andThen(() => repairMonths(id))
		.andThen(() => saveYears(id, t))
		.andThen(() => saveChecks(id, t))
		.andThen(() => deleteUnused(id, t));

/** In the order each step reads what the last wrote. */
const settleEverything = (id: string): ResultAsync<void> =>
	rebookAll(id)
		.andThen(() => saveMonthsAll(id))
		.andThen(() => saveYearsAll(id))
		.andThen(() => saveChecksAll(id))
		.andThen(() => deleteUnusedAll(id));

/**
 * Whether a transaction counts depends only on its group's links, so what no
 * changed transaction links leaves all as they were.
 */
const recount = (id: string, g: boolean): ResultAsync<DB.Touched> =>
	g
		? DB.listGroupTransactions(id).andThen((m) => DB.recount(id, checkGroups(m).uncounted))
		: okAsync(UNTOUCHED);

const rebook = (id: string, t: Settling): ResultAsync<void> => {
	const lots = [...new Set(t.commodities)];
	return lots.length === 0 ? okAsync() : DB.rebook(id, lots);
};

const rebookAll = (id: string): ResultAsync<void> =>
	DB.listLotCommodities(id).andThen((c) => DB.rebook(id, c));

const saveMonths = (id: string, t: Settling): ResultAsync<void> =>
	t.span ? DB.saveMonthlyDeltas(id, { span: t.span, holdings: t.holdings }) : okAsync();

const saveMonthsAll = (id: string): ResultAsync<void> => DB.saveEveryMonth(id);

/**
 * Puts right the months the check has come round to and the years they fall in,
 * so what a bug left wrong does not stay.
 */
const repairMonths = (id: string): ResultAsync<void> =>
	DB.saveCheckedMonths(id).andThen((y) =>
		y ? DB.saveBalanceYears(id, { ...y, holdings: null }) : okAsync(),
	);

const saveYears = (id: string, t: Settling): ResultAsync<void> =>
	t.span
		? DB.saveBalanceYears(id, { from: t.span.from.year, to: null, holdings: t.holdings })
		: okAsync();

const saveYearsAll = (id: string): ResultAsync<void> => DB.saveEveryYear(id);

const saveChecks = (id: string, t: Settling): ResultAsync<void> =>
	t.span ? DB.saveBalanceChecks(id, { from: t.span.from, holdings: t.holdings }) : okAsync();

const saveChecksAll = (id: string): ResultAsync<void> =>
	DB.saveBalanceChecks(id, { from: Temporal.PlainDate.from(BEGINNING), holdings: null });

/**
 * An account with postings keeps those above it, so only one left without any
 * can leave accounts unused, and most edits skip the scan of every account.
 */
const deleteUnused = (id: string, t: Settling): ResultAsync<void> =>
	DB.anyEmptied(t.holdings.map((k) => k.accountId)).andThen((e) =>
		e ? DB.deleteUnusedAccounts(id) : okAsync(),
	);

const deleteUnusedAll = (id: string): ResultAsync<void> => DB.deleteUnusedAccounts(id);
