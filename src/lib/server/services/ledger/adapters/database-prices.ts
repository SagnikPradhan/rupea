import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { total } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import type { Bucket, Span } from '#lib/shared/dates.ts';
import { sql, type Expression, type ExpressionBuilder } from 'kysely';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import type { Flow } from '../domain/returns';
import type { Spent } from '../domain/spending';
import { INVESTMENT_INCOME } from '../domain/taxonomy';
import { AccountType, Feed, PriceKind, PriceSource } from '../domain/types';
import { multiply, underAccount } from './database-queries';

export type { PartOf, Worth } from '../domain/worth';

/** The most prices a commodity is converted through on its way to rupees. */
const MAX_PRICES = 2;

export const findLatestPrices = (
	ledgerId: string,
	commodities: string[],
	day: Temporal.PlainDate,
): ResultAsync<Record<string, Quantity>> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.with('own', ownSymbols(db, ledgerId))
				.selectFrom(
					sql<{ commodity: string }>`(select unnest(${commodities}::text[]) as commodity)`.as('c'),
				)
				.leftJoin('own', 'own.symbol', 'c.commodity')
				.innerJoinLateral(
					(e) =>
						priceOn(db, ledgerId, {
							symbolId: e.ref('own.id'),
							commodity: e.ref('c.commodity'),
							day: e.val(day.toString()),
						}).as('p'),
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

type SpendingOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: Bucket;
	account: string;
};

/**
 * Values each counted amount under an account at the latest price on or before its own day, as
 * worth does, and adds them up by account and the bucket its day falls in.
 */
export const listSpending = (
	ledgerId: string,
	{ from, to, bucket, account }: SpendingOptions,
): ResultAsync<Spent[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('spent', (q) =>
					q
						.selectFrom('postings as p')
						.innerJoin('transactions as t', 't.id', 'p.transactionId')
						.innerJoin('accounts as a', 'a.id', 'p.accountId')
						.leftJoin('own as o', 'o.symbol', 'p.commodity')
						.select((e) => [
							'a.name as account',
							't.date',
							'p.commodity',
							'o.id as symbolId',
							e.fn.sum<bigint>('p.amount').as('amount'),
							e.fn.countAll<bigint>().as('postings'),
						])
						.where('p.ledgerId', '=', ledgerId)
						.where('p.accountType', '=', AccountType.Expenses)
						.where((e) => underAccount(e.ref('a.name'), account))
						.where('t.date', '>=', from.toString())
						.where('t.date', '<=', to.toString())
						.where('t.counted', '=', true)
						.groupBy(['a.name', 't.date', 'p.commodity', 'o.id']),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, hops)', (q) =>
					q
						.selectFrom('spent as s')
						.select([
							's.commodity as origin',
							's.date as day',
							's.commodity',
							's.symbolId as at',
							sql<bigint>`${sql.lit(AMOUNT_UNIT)}::numeric`.as('rate'),
							sql<number>`0`.as('hops'),
						])
						.distinct()
						.where('s.commodity', '<>', DEFAULT_COMMODITY)
						.unionAll(nextRate(db, ledgerId)),
				)
				.with('valued', (q) =>
					q
						.selectFrom('spent as s')
						.leftJoin('rates as r', (j) =>
							j
								.onRef('r.origin', '=', 's.commodity')
								.onRef('r.day', '=', 's.date')
								.on('r.commodity', '=', DEFAULT_COMMODITY),
						)
						.select((e) => [
							's.account',
							's.date',
							's.postings',
							sql<string>`date_trunc(${bucket}, ${e.ref('s.date')}::timestamp)::date`.as('bucket'),
							e
								.case()
								.when('s.commodity', '=', DEFAULT_COMMODITY)
								.then(e.ref('s.amount'))
								.else(multiply(e.ref('s.amount'), e.ref('r.rate')))
								.end()
								.as('value'),
						]),
				)
				.selectFrom('valued as v')
				.select((e) => [
					'v.account',
					'v.bucket',
					e.fn.min('v.date').as('first'),
					total(e.ref('v.value')).as('amount'),
					sql<number>`${total(e.ref('v.postings'), e('v.value', 'is', null))}::integer`.as(
						'unpriced',
					),
				])
				.groupBy(['v.account', 'v.bucket'])
				.orderBy('v.account')
				.orderBy('v.bucket')
				.execute(),
		).map((rows) =>
			rows.map((s) => ({
				account: s.account,
				bucket: Temporal.PlainDate.from(s.bucket),
				first: Temporal.PlainDate.from(s.first),
				amount: s.amount as Amount,
				unpriced: s.unpriced,
			})),
		),
	);

/**
 * What flowed into each Assets account on each day in rupees: the value of its counted postings,
 * less its share of their transaction's net investment income. That income goes to the
 * transaction's Assets postings of commodities other than rupees, or to its rupee ones when it has
 * none, split equally with what does not divide going to the first. A posting is valued at its own
 * price when it names one, then at the latest price on or before its day, as worth does.
 */
export const listFlows = (ledgerId: string, { from, to }: Span): ResultAsync<Flow[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('earning', (q) =>
					q
						.selectFrom('accounts as a')
						.select('a.id')
						.where('a.ledgerId', '=', ledgerId)
						.where((e) => e.or(INVESTMENT_INCOME.map((n) => underAccount(e.ref('a.name'), n)))),
				)
				.with('moved', (q) =>
					q
						.selectFrom('postings as p')
						.innerJoin('transactions as t', 't.id', 'p.transactionId')
						.innerJoin('accounts as a', 'a.id', 'p.accountId')
						.leftJoin('earning as g', 'g.id', 'p.accountId')
						.select((e) => [
							'p.transactionId',
							'p.position',
							'a.name as account',
							't.date',
							e('g.id', 'is not', null).as('earned'),
							e('p.commodity', '<>', DEFAULT_COMMODITY).as('held'),
							e.fn.coalesce('p.priceCommodity', 'p.commodity').as('commodity'),
							e
								.case()
								.when('p.priceKind', '=', PriceKind.Unit)
								.then(multiply(e.ref('p.amount'), e.ref('p.priceAmount')))
								.when('p.priceKind', '=', PriceKind.Total)
								.then(sql<bigint>`sign(${e.ref('p.amount')}) * ${e.ref('p.priceAmount')}`)
								.else(e.ref('p.amount'))
								.end()
								.as('amount'),
						])
						.where('p.ledgerId', '=', ledgerId)
						.where('t.date', '>=', from.toString())
						.where('t.date', '<=', to.toString())
						.where('t.counted', '=', true)
						.where((e) =>
							e.or([e('p.accountType', '=', AccountType.Assets), e('g.id', 'is not', null)]),
						),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, hops)', (q) =>
					q
						.selectFrom('moved as m')
						.leftJoin('own as o', 'o.symbol', 'm.commodity')
						.select([
							'm.commodity as origin',
							'm.date as day',
							'm.commodity',
							'o.id as at',
							sql<bigint>`${sql.lit(AMOUNT_UNIT)}::numeric`.as('rate'),
							sql<number>`0`.as('hops'),
						])
						.distinct()
						.where('m.commodity', '<>', DEFAULT_COMMODITY)
						.unionAll(nextRate(db, ledgerId)),
				)
				.with('valued', (q) =>
					q
						.selectFrom('moved as m')
						.leftJoin('rates as r', (j) =>
							j
								.onRef('r.origin', '=', 'm.commodity')
								.onRef('r.day', '=', 'm.date')
								.on('r.commodity', '=', DEFAULT_COMMODITY),
						)
						.select((e) => [
							'm.transactionId',
							'm.position',
							'm.account',
							'm.date',
							'm.earned',
							'm.held',
							e
								.case()
								.when('m.commodity', '=', DEFAULT_COMMODITY)
								.then(e.ref('m.amount'))
								.else(multiply(e.ref('m.amount'), e.ref('r.rate')))
								.end()
								.as('value'),
						]),
				)
				.with('earned', (q) =>
					q
						.selectFrom('valued as v')
						.selectAll('v')
						.select((e) => {
							const within = sql`over (partition by ${e.ref('v.transactionId')})`;
							const income = sql`sum(${e.ref('v.value')}) filter (where ${e.ref('v.earned')}) ${within}`;
							const unknown = sql`count(*) filter (where ${e.ref('v.earned')} and ${e.ref('v.value')} is null) ${within}`;

							return [
								sql<bigint | null>`case when ${unknown} = 0 then -coalesce(${income}, 0) end`.as(
									'income',
								),
								sql<boolean>`coalesce(bool_or(${e.ref('v.held')}) filter (where not ${e.ref('v.earned')}) ${within}, false)`.as(
									'anyHeld',
								),
							];
						}),
				)
				.with('shared', (q) =>
					q
						.selectFrom('earned as x')
						.selectAll('x')
						.select((e) => {
							const target = sql<boolean>`not ${e.ref('x.earned')} and (${e.ref('x.held')} or not ${e.ref('x.anyHeld')})`;
							const within = sql`over (partition by ${e.ref('x.transactionId')})`;

							return [
								target.as('target'),
								sql<number>`count(*) filter (where ${target}) ${within}`.as('targets'),
								sql<number>`row_number() over (partition by ${e.ref('x.transactionId')} order by ${target} desc, ${e.ref('x.position')})`.as(
									'rank',
								),
							];
						}),
				)
				.with('flows', (q) =>
					q
						.selectFrom('shared as s')
						.select((e) => {
							const each = sql<bigint>`trunc(${e.ref('s.income')} / ${e.ref('s.targets')})`;
							const rest = sql<bigint>`${e.ref('s.income')} - ${each} * ${e.ref('s.targets')}`;
							const share = sql<bigint>`case when not ${e.ref('s.target')} then 0 when ${e.ref('s.rank')} = 1 then ${each} + ${rest} else ${each} end`;

							return [
								's.account',
								's.date',
								sql<bigint | null>`${e.ref('s.value')} - ${share}`.as('amount'),
							];
						})
						.where('s.earned', '=', false),
				)
				.selectFrom('flows as f')
				.select((e) => [
					'f.account',
					'f.date',
					total(e.ref('f.amount')).as('amount'),
					sql<number>`(count(*) filter (where ${e.ref('f.amount')} is null))::integer`.as(
						'unpriced',
					),
				])
				.groupBy(['f.account', 'f.date'])
				.orderBy('f.account')
				.orderBy('f.date')
				.execute(),
		).map((rows) =>
			rows.map((f) => ({
				account: f.account,
				day: Temporal.PlainDate.from(f.date),
				amount: f.amount as Amount,
				unpriced: f.unpriced,
			})),
		),
	);

/** The ledger's own symbols, so each commodity is looked up once rather than once a day. */
const ownSymbols = (db: Database, ledgerId: string) =>
	db
		.selectFrom('symbols')
		.select(['symbols.id', 'symbols.symbol'])
		.where('symbols.feed', '=', Feed.Ledger)
		.where('symbols.ledgerId', '=', ledgerId);

type Converting = {
	rates: {
		origin: string;
		day: string;
		commodity: string;
		at: string | null;
		rate: bigint;
		hops: number;
	};
	own: { id: string; symbol: string };
};

/** Each commodity's next price on its way to rupees, from the one the rate reached last. */
const nextRate = (db: Database, ledgerId: string) => (r: ExpressionBuilder<Converting, never>) =>
	r
		.selectFrom('rates as r')
		.innerJoinLateral(
			(e) =>
				priceOn(db, ledgerId, {
					symbolId: e.ref('r.at'),
					commodity: e.ref('r.commodity'),
					day: e.ref('r.day'),
				}).as('p'),
			(j) => j.onTrue(),
		)
		.leftJoin('own as o', 'o.symbol', 'p.currency')
		.select((e) => [
			'r.origin',
			'r.day',
			'p.currency as commodity',
			'o.id as at',
			multiply(e.ref('r.rate'), e.ref('p.amount')).as('rate'),
			e('r.hops', '+', 1).as('hops'),
		])
		.where('r.commodity', '<>', DEFAULT_COMMODITY)
		.where('r.hops', '<', MAX_PRICES);

type PriceOnOptions = {
	symbolId: Expression<string | null>;
	commodity: Expression<string>;
	day: Expression<string>;
};

/**
 * The latest price of a commodity on or before a day, from the ledger's own symbol or the feed it
 * links to then. On one day a P line beats an at-price, and either beats a feed's quote.
 */
const priceOn = (db: Database, ledgerId: string, { symbolId, commodity, day }: PriceOnOptions) =>
	db
		.selectFrom(
			db
				.selectFrom(ownPrice(db, symbolId, day).as('o'))
				.selectAll()
				.unionAll(db.selectFrom(quotedPrice(db, ledgerId, commodity, day).as('q')).selectAll())
				.as('c'),
		)
		.select(['c.amount', 'c.currency'])
		.orderBy('c.date', 'desc')
		.orderBy('c.rank')
		.limit(1);

/** The latest price of a symbol on or before a day, where a P line beats an at-price on the same day. */
const ownPrice = (db: Database, symbolId: Expression<string | null>, day: Expression<string>) =>
	db
		.selectFrom('prices')
		.select((e) => [
			'prices.priceAmount as amount',
			'prices.priceCommodity as currency',
			'prices.date',
			e.case().when('prices.source', '=', PriceSource.Line).then(0).else(1).end().as('rank'),
		])
		.where('prices.symbolId', '=', symbolId)
		.where('prices.date', '<=', day)
		.orderBy('prices.date', 'desc')
		.orderBy((e) => e('prices.source', '=', PriceSource.Line), 'desc')
		.orderBy('prices.line', 'desc')
		.limit(1);

/** The latest quote on or before a day of the feed a commodity links to then. */
const quotedPrice = (
	db: Database,
	ledgerId: string,
	commodity: Expression<string>,
	day: Expression<string>,
) =>
	db
		.selectFrom(linksOf(db, ledgerId, commodity).as('l'))
		.innerJoinLateral(
			(e) =>
				db
					.selectFrom('prices')
					.select([
						'prices.priceAmount as amount',
						'prices.priceCommodity as currency',
						'prices.date',
					])
					.where('prices.symbolId', '=', e.ref('l.symbolId'))
					.where('prices.date', '<=', day)
					.where('prices.date', '>=', e.ref('l.since'))
					.where('prices.date', '<', e.ref('l.until'))
					.orderBy('prices.date', 'desc')
					.limit(1)
					.as('q'),
			(j) => j.onTrue(),
		)
		.select(['q.amount', 'q.currency', 'q.date', sql<number>`2`.as('rank')])
		.orderBy('q.date', 'desc')
		.limit(1);

/**
 * A commodity's links, each holding from its since until the next. A link from the start holds
 * from -infinity, so of two links from one day the later written holds.
 */
const linksOf = (db: Database, ledgerId: string, commodity: Expression<string>) =>
	db
		.selectFrom('symbolLinks as l')
		.select((e) => {
			const since = sql<string>`coalesce(${e.ref('l.since')}, '-infinity'::date)`;
			return [
				'l.symbolId',
				since.as('since'),
				sql<string>`coalesce(lead(${since}) over (order by ${since}, ${e.ref('l.id')}), 'infinity'::date)`.as(
					'until',
				),
			];
		})
		.where('l.ledgerId', '=', ledgerId)
		.where('l.alias', '=', commodity);
