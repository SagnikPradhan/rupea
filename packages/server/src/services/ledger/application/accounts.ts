import { consistently } from '#lib/server/db/read-only.ts';
import { okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import type { AccountRow } from '@rupea/shared/account-tree.ts';
import { type Span } from '@rupea/shared/dates.ts';
import { fault, type Batch, type RupeaError } from '@rupea/shared/errors.ts';
import * as DB from '../adapters/database';
import { bridgeOf, type Bridge } from '../domain/bridge';
import { type Balances } from '../domain/deltas';
import { dropsOf, type Drops } from '../domain/drawdown';
import { EARNING, flowsOf } from '../domain/flows';
import { INVESTMENT_INCOME } from '../domain/taxonomy';
import { type LotHistory } from '../domain/lots';
import { returnsOf, type Returns } from '../domain/returns';
import { accountsIn, idsIn, parentsIn, partsIn, type AccountNode } from '../domain/tree';
import { type Ledger } from '../domain/types';
import { movesOf } from '../domain/worth';
import { listBalances, listDeltas, listLongDeltas, spanFrom, worthWalked } from './deltas';

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
 * what prices did to each group of balances, over every balance account, as
 * income and expenses belong to the whole ledger. Nothing comes back for a span
 * in which nothing was held.
 */
export const findBridge = ({ ledger, from, to }: FindBridgeOptions): ResultAsync<Batch<Bridge>> =>
	consistently(() =>
		listBalances({ ledger, from, to, bucket: 'year' }).andThen((ended) => {
			const end = ended.succeeded[0];
			if (end === undefined || end.rows.length === 0)
				return okAsync({ succeeded: [], failed: ended.failed });

			const first = end.from;
			const after = { ledger, from: first.add({ days: 1 }), to };

			return ResultAsync.combine([
				listBalances({ ledger, from: first, to: first, bucket: 'date' }),
				Temporal.PlainDate.compare(after.from, to) > 0
					? okAsync(null)
					: listDeltas({ ...after, bucket: 'year' }),
			]).map(([start, gains]) => ({
				succeeded: [
					bridgeOf({
						from: first,
						to,
						start: start.succeeded[0]?.rows ?? [],
						end: end.rows,
						gains: gains?.succeeded[0]?.rows ?? [],
					}),
				],
				failed: ended.failed,
			}));
		}),
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
	const assets = { ledger, account: 'Assets', bucket: 'date' } as const;
	const cost = { valued: 'cost' } as const;
	const before = from.subtract({ days: 1 });

	const earned = INVESTMENT_INCOME.filter((n) => idsIn(tree, n).length > 0).map((a) =>
		listLongDeltas({ ledger, account: a, ...cost, from, to, bucket: 'posting' }),
	);

	return ResultAsync.combine([
		listBalances({ ...assets, from: before, to: before }),
		listBalances({ ...assets, from: to, to }),
		listLongDeltas({ ...assets, ...cost, from, to }),
		listLongDeltas({ ...assets, ...cost, from, to, bucket: 'posting', filter: EARNING }),
		ResultAsync.combine(earned),
	]).map(([start, end, moved, alongside, earned]) => {
		const rowsOf = (b: Batch<Balances>) => b.succeeded[0]?.rows ?? [];
		const flows = flowsOf(rowsOf(moved), [...rowsOf(alongside), ...earned.flatMap(rowsOf)]);
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
