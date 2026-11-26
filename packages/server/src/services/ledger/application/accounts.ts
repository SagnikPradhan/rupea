import { consistently } from '#lib/server/db/read-only.ts';
import { errAsync, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import type { AccountRow } from '@rupea/shared/account-tree.ts';
import { BEGINNING, type Span } from '@rupea/shared/dates.ts';
import { fault, type Batch, type RupeaError } from '@rupea/shared/errors.ts';
import { ASSETS } from '@rupea/shared/money.ts';
import * as DB from '../adapters/database';
import { bridgeOf, type Bridge } from '../domain/bridge';
import { type Balances } from '../domain/deltas';
import { dropsOf, type Drops } from '../domain/drawdown';
import { EARNING, flowsOf } from '../domain/flows';
import { INVESTMENT_INCOME } from '../domain/taxonomy';
import { type LotHistory } from '../domain/lots';
import { returnsOf, type Returns } from '../domain/returns';
import { accountsIn, idsIn, parentsIn, type AccountNode } from '../domain/tree';
import { type Ledger } from '../domain/types';
import { findShared, isRoot, listBalances, listDeltas, findSpan, type Shared } from './deltas';

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
		findShared(ledger.id).andThen((shared) =>
			lottedIn(ledger.id, { account: account ?? ASSETS, to, tree: shared.tree }).andThen((held) => {
				if (!held.length) return okAsync({ succeeded: [], failed: [] });

				return listBalances({
					ledger,
					from,
					to,
					accounts: held.map((h) => h.name),
					exact: true,
					bucket: 'date',
					measures: ['units', 'price'],
					series: true,
					shared,
				}).map((daily) => {
					const balances = daily.succeeded[0];
					const drops = balances === undefined ? null : dropsOf(balances, held);

					return { succeeded: drops === null ? [] : [drops], failed: daily.failed };
				});
			}),
		),
	);

type LottedInOptions = { account: string; to: Temporal.PlainDate; tree: AccountNode[] };

/**
 * The holdings that had lots by a day, in an account and those under it. Fails
 * for an account that is not in the ledger.
 */
const lottedIn = (id: string, { account, to, tree }: LottedInOptions) =>
	DB.listLotted(id, { to }).andThen((lots) => {
		const ids = new Set(idsIn(tree, account));
		const inside = tree.filter((n) => ids.has(n.id));
		if (!inside.length && !isRoot(account)) return errAsync(fault('AccountNotFound', { account }));

		const byId = Object.groupBy(lots, (l) => l.accountId);

		return okAsync(
			inside.flatMap((n) =>
				(byId[n.id] ?? []).map((l) => ({ name: n.name, commodity: l.commodity })),
			),
		);
	});

type FindBridgeOptions = {
	ledger: Ledger;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
};

/**
 * Why net worth went from the end of the later of the span's first day and the
 * first day any account moved, to its last: the income and expenses after that
 * day, and what prices did to each group of balances, over every balance
 * account, as income and expenses belong to the whole ledger. Nothing comes
 * back for a span in which nothing was held.
 */
export const findBridge = ({ ledger, from, to }: FindBridgeOptions): ResultAsync<Batch<Bridge>> =>
	consistently(() =>
		findShared(ledger.id).andThen((shared) =>
			listBalances({ ledger, from, to, bucket: 'year', shared }).andThen((ended) => {
				const end = ended.succeeded[0];
				if (end === undefined || end.rows.length === 0)
					return okAsync({ succeeded: [], failed: ended.failed });

				const first = end.from;
				const after = { ledger, from: first.add({ days: 1 }), to, shared };

				return ResultAsync.combine([
					listBalances({ ledger, from: first, to: first, bucket: 'date', shared }),
					Temporal.PlainDate.compare(after.from, to) > 0
						? okAsync(null)
						: listDeltas({ ...after, bucket: 'year' }),
				]).map((r) => batchedBridgeOf({ first, to, end, failed: ended.failed }, r));
			}),
		),
	);

type BatchedBridgeOptions = {
	first: Temporal.PlainDate;
	to: Temporal.PlainDate;
	end: Balances;
	failed: RupeaError[];
};

const batchedBridgeOf = (
	{ first, to, end, failed }: BatchedBridgeOptions,
	[start, gains]: [Batch<Balances>, Batch<Balances> | null],
): Batch<Bridge> => {
	const failures = [...failed, ...start.failed, ...(gains?.failed ?? [])];

	return {
		succeeded: [
			bridgeOf({
				from: first,
				to,
				start: start.succeeded[0]?.rows ?? [],
				end: end.rows,
				gains: gains?.succeeded[0]?.rows ?? [],
			}),
		],
		failed: [...new Map(failures.map((f) => [JSON.stringify(f), f])).values()],
	};
};

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
		findShared(ledger.id).andThen((shared) => {
			const accounts = shared.tree.map((n) => n.id);

			return findSpan(ledger.id, { from, to }, { accounts })
				.andThen((s) => returnsOver({ ledger, shared, span: s }))
				.map((r) => ({ succeeded: r.succeeded, failed: [...shared.failed, ...r.failed] }));
		}),
	);

type ReturnsOverOptions = { ledger: Ledger; shared: Shared; span: Span };

const returnsOver = ({ ledger, shared, span }: ReturnsOverOptions) => {
	const { from, to } = span;
	const tree = shared.tree;
	const assets = { ledger, shared, accounts: [ASSETS], bucket: 'date' as const };
	const held = { ledger, shared, accounts: [ASSETS], bucket: 'date' as const };
	const cost = { valued: 'cost' } as const;
	const before = from.subtract({ days: 1 });
	const nothing = okAsync<Batch<Balances>>({ succeeded: [], failed: [] });

	const earned = INVESTMENT_INCOME.filter((n) => idsIn(tree, n).length > 0).map((a) =>
		listDeltas({ ledger, shared, accounts: [a], ...cost, from, to, bucket: 'posting' }),
	);

	return ResultAsync.combine([
		from.toString() === BEGINNING ? nothing : listBalances({ ...held, from: before, to: before }),
		listBalances({ ...held, from: to, to }),
		listDeltas({ ...assets, ...cost, from, to }),
		listDeltas({ ...assets, ...cost, from, to, bucket: 'posting', filter: EARNING }),
		ResultAsync.combine(earned),
	]).map(([start, end, moved, alongside, earned]) => {
		const rowsOf = (b: Batch<Balances>) => b.succeeded[0]?.rows ?? [];
		const flows = flowsOf({
			deltas: rowsOf(moved),
			earning: [...rowsOf(alongside), ...earned.flatMap(rowsOf)],
			base: ledger.base,
		});
		const accounts = Object.keys(parentsIn(tree));
		const returns = returnsOf({
			accounts,
			start: rowsOf(start),
			end: rowsOf(end),
			flows,
			span: { from, to },
		});

		return { succeeded: returns, failed: unsolvedIn(returns) };
	});
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

/**
 * Each account whose XIRR could not be worked out, unless one under it could
 * not either.
 */
const unsolvedIn = (returns: Returns[]): RupeaError[] => {
	const failed = returns.filter((r) => r.xirr === null);
	const deepest = failed.filter((r) => !failed.some((o) => o.account.startsWith(`${r.account}:`)));

	return deepest.map((r) =>
		r.why === 'unpriced'
			? fault('ReturnUnpriced', { account: r.account, unpriced: r.unpriced })
			: fault('ReturnUnsolved', { account: r.account }),
	);
};
