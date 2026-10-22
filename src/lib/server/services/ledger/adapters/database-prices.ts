import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { runningTotal, total, unset } from '#lib/server/db/expressions.ts';
import type { Queries } from '#lib/server/db/index.ts';
import { sql, type Expression, type SqlBool } from 'kysely';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import { AccountType, Feed, PriceSource } from '../domain/types';
import { multiply } from './database-queries';

/** The most prices a commodity is converted through on its way to rupees. */
const MAX_PRICES = 2;

/** What balance accounts were worth in rupees at the end of one day, and how many commodities had no price. */
export type Worth = {
	day: Temporal.PlainDate;
	assets: Amount;
	liabilities: Amount;
	worth: Amount;
	unpriced: number;
};

export const findLatestPrices = (
	ledgerId: string,
	commodities: string[],
	day: Temporal.PlainDate,
): ResultAsync<Record<string, Quantity>> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.with('own', ownSymbols(kysely, ledgerId))
				.selectFrom(
					sql<{ commodity: string }>`(select unnest(${commodities}::text[]) as commodity)`.as('c'),
				)
				.innerJoin('own', 'own.symbol', 'c.commodity')
				.innerJoinLateral(
					priceOn(kysely, sql.ref<string>('own.id'), sql<string>`${day.toString()}::date`).as('p'),
					(j) => j.onTrue(),
				)
				.select(['c.commodity', 'p.amount', 'p.currency'])
				.execute(),
		).map((r) =>
			Object.fromEntries(
				r.map((p) => [p.commodity, { amount: p.amount as Amount, commodity: p.currency }]),
			),
		),
	);

/**
 * Each day values its balances at the latest price on or before it, reaching rupees in at most
 * two prices and rounding each step as multiply does. The first day is the later of from and the
 * ledger's first counted transaction.
 */
export const listWorth = (
	ledgerId: string,
	from: Temporal.PlainDate,
	to: Temporal.PlainDate,
): ResultAsync<Worth[]> =>
	withContext('kysely')((kysely) => {
		const firstDay = sql<string>`(select min(day) from days)`;
		const isAsset = sql<boolean>`${sql.ref('postings.accountType')} = ${sql.lit(AccountType.Assets)}`;

		return attempt(() =>
			kysely
				// Kysely writes with recursive only when the first CTE asks for it
				.withRecursive('own(id, symbol)', () => ownSymbols(kysely, ledgerId))
				.with('deltas', (q) =>
					q
						.selectFrom('postings')
						.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
						.select([
							isAsset.as('asset'),
							'postings.commodity',
							'transactions.date',
							sql<bigint>`sum(${sql.ref('postings.amount')})`.as('amount'),
						])
						.where('postings.ledgerId', '=', ledgerId)
						.where('postings.accountType', 'in', [AccountType.Assets, AccountType.Liabilities])
						.where('transactions.date', '<=', to.toString())
						.where('transactions.counted', '=', true)
						.groupBy([isAsset, 'postings.commodity', 'transactions.date']),
				)
				.with('first', (q) =>
					q.selectFrom('deltas').select((e) => e.fn.min('deltas.date').as('day')),
				)
				.with('days', (q) =>
					q
						.selectFrom('first')
						.select(
							sql<string>`generate_series(greatest(${from.toString()}::date, ${sql.ref('first.day')}), ${to.toString()}::date, interval '1 day')::date`.as(
								'day',
							),
						)
						.where('first.day', 'is not', null),
				)
				.with('keys', (q) =>
					q
						.selectFrom('deltas as x')
						.leftJoin('own as o', 'o.symbol', 'x.commodity')
						.select((e) => [
							'x.asset',
							'x.commodity',
							'o.id as symbolId',
							total('x.amount', e('x.date', '<', firstDay)).as('opening'),
						])
						.groupBy(['x.asset', 'x.commodity', 'o.id']),
				)
				.with('balances', (q) =>
					q
						.selectFrom('keys as k')
						.crossJoin('days as d')
						.leftJoin('deltas as x', (j) =>
							j
								.onRef('x.asset', '=', 'k.asset')
								.onRef('x.commodity', '=', 'k.commodity')
								.onRef('x.date', '=', 'd.day'),
						)
						.select([
							'k.asset',
							'k.commodity',
							'k.symbolId',
							'd.day',
							sql<bigint>`${sql.ref('k.opening')} + ${runningTotal('x.amount', ['k.asset', 'k.commodity'], 'd.day')}`.as(
								'units',
							),
						]),
				)
				.withRecursive('rates(symbolId, day, commodity, at, rate, hops)', (q) =>
					q
						.selectFrom('balances as b')
						.select([
							'b.symbolId',
							'b.day',
							'b.commodity',
							'b.symbolId as at',
							sql<bigint>`${sql.lit(AMOUNT_UNIT)}::numeric`.as('rate'),
							sql<number>`0`.as('hops'),
						])
						.distinct()
						.where('b.commodity', '<>', DEFAULT_COMMODITY)
						.where('b.symbolId', 'is not', null)
						.unionAll((r) =>
							r
								.selectFrom('rates as r')
								.innerJoinLateral(
									priceOn(kysely, sql.ref<string>('r.at'), sql.ref<string>('r.day')).as('p'),
									(j) => j.onTrue(),
								)
								.leftJoin('own as o', 'o.symbol', 'p.currency')
								.select([
									'r.symbolId',
									'r.day',
									'p.currency as commodity',
									'o.id as at',
									multiply(sql.ref('r.rate'), sql.ref('p.amount')).as('rate'),
									sql<number>`${sql.ref('r.hops')} + 1`.as('hops'),
								])
								.where('r.commodity', '<>', DEFAULT_COMMODITY)
								.where('r.hops', '<', MAX_PRICES),
						),
				)
				.with('valued', (q) =>
					q
						.selectFrom('balances as b')
						.leftJoin('rates as r', (j) =>
							j
								.onRef('r.symbolId', '=', 'b.symbolId')
								.onRef('r.day', '=', 'b.day')
								.on('r.commodity', '=', DEFAULT_COMMODITY),
						)
						.select((e) => [
							'b.day',
							'b.asset',
							e
								.case()
								.when('b.commodity', '=', DEFAULT_COMMODITY)
								.then(e.ref('b.units'))
								.else(multiply(e.ref('b.units'), e.ref('r.rate')))
								.end()
								.as('value'),
						])
						.where('b.units', '<>', 0n),
				)
				.selectFrom('days as d')
				.leftJoin('valued as v', 'v.day', 'd.day')
				.select([
					'd.day',
					total('v.value', 'v.asset').as('assets'),
					sql<bigint>`-${total('v.value', sql<SqlBool>`not ${sql.ref('v.asset')}`)}`.as(
						'liabilities',
					),
					total('v.value').as('worth'),
					unset('v.value', 'v.day').as('unpriced'),
				])
				.groupBy('d.day')
				.orderBy('d.day')
				.execute(),
		).map((rows) =>
			rows.map((w) => ({
				day: Temporal.PlainDate.from(w.day),
				assets: w.assets as Amount,
				liabilities: w.liabilities as Amount,
				worth: w.worth as Amount,
				unpriced: w.unpriced,
			})),
		);
	});

/** The ledger's own symbols, so each commodity is looked up once rather than once a day. */
const ownSymbols = (kysely: Queries, ledgerId: string) =>
	kysely
		.selectFrom('symbols')
		.select(['symbols.id', 'symbols.symbol'])
		.where('symbols.feed', '=', Feed.Ledger)
		.where('symbols.ledgerId', '=', ledgerId);

/** The latest price of a symbol on or before a day, where a P line beats an at-price on the same day. */
const priceOn = (kysely: Queries, symbolId: Expression<string>, day: Expression<string>) =>
	kysely
		.selectFrom('prices')
		.select(['prices.priceAmount as amount', 'prices.priceCommodity as currency'])
		.where('prices.symbolId', '=', symbolId)
		.where('prices.date', '<=', day)
		.orderBy(
			sql`${sql.ref('prices.date')} desc, ${sql.ref('prices.source')} = ${PriceSource.Line} desc, ${sql.ref('prices.line')} desc`,
		)
		.limit(1);
