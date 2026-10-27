import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { monthOf, runningTotal, total, unset } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import type { Bucket } from '#lib/shared/dates.ts';
import { sql, type Expression } from 'kysely';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import type { Spent } from '../domain/spending';
import { BALANCE_TYPES } from '../domain/taxonomy';
import { AccountType, Feed, PriceSource } from '../domain/types';
import { multiply, underAccount } from './database-queries';

/** The most prices a commodity is converted through on its way to rupees. */
const MAX_PRICES = 2;

/** What balance accounts were worth in rupees at the end of one day, owing below zero as the accounts hold it, and how many commodities had no price. */
export type Worth = {
	day: Temporal.PlainDate;
	assets: Amount;
	liabilities: Amount;
	worth: Amount;
	/** What each part was worth: an account, or one commodity it holds when worth is divided by commodity. */
	parts: { account: string; commodity: string | null; amount: Amount }[];
	unpriced: number;
};

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

/** The part an account's balances count towards. */
export type PartOf = { accountId: string; part: string };

type WorthOptions = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	/** The accounts counted, each with its part; any other account is left out. */
	parts: PartOf[];
	/** Divides each part again by the commodities it holds. */
	byCommodity: boolean;
};

/**
 * Each day values its balances at the latest price on or before it, reaching rupees in at most
 * two prices and rounding each step as multiply does. The first day is the later of from and the
 * ledger's first counted transaction, and what came before the start month is summed by the month.
 * Only the accounts given parts are counted.
 */
export const listWorth = (
	ledgerId: string,
	{ from, to, parts, byCommodity }: WorthOptions,
): ResultAsync<Worth[]> =>
	withContext('db')((db) => {
		const firstMonth = sql<string>`(select min(month) from months)`;
		const startMonth = sql<string>`(select ${monthOf(sql.ref('day'))} from start)`;

		return attempt(() =>
			db
				// Kysely writes with recursive only when the first CTE asks for it
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('parts', (q) =>
					q
						.selectFrom(
							sql<PartOf>`(select * from unnest(${parts.map((p) => p.accountId)}::uuid[], ${parts.map((p) => p.part)}::text[]) as x(account_id, part))`.as(
								'x',
							),
						)
						.selectAll(),
				)
				.with('months', (q) =>
					q
						.selectFrom('monthlyDeltas as m')
						.innerJoin('parts as x', 'x.accountId', 'm.accountId')
						.select((e) => [
							e('m.accountType', '=', AccountType.Assets).as('asset'),
							'x.part',
							'm.commodity',
							'm.month',
							e.fn.sum<bigint>('m.amount').as('amount'),
						])
						.where('m.ledgerId', '=', ledgerId)
						.where('m.accountType', 'in', BALANCE_TYPES)
						.where('m.month', '<=', to.toString())
						.groupBy(['m.accountType', 'x.part', 'm.commodity', 'm.month']),
				)
				.with('start', (q) =>
					q
						.selectFrom('dailyDeltas as d')
						.select((e) =>
							sql<string>`greatest(${from.toString()}::date, ${e.fn.min('d.date')})`.as('day'),
						)
						.where('d.ledgerId', '=', ledgerId)
						.where('d.accountType', 'in', BALANCE_TYPES)
						.where('d.accountId', 'in', (e) => e.selectFrom('parts').select('parts.accountId'))
						.where('d.date', '>=', firstMonth)
						.where('d.date', '<', sql<string>`${firstMonth} + interval '1 month'`)
						.having((e) => e.fn.min('d.date'), 'is not', null),
				)
				.with('days', (q) =>
					q
						.selectFrom('start')
						.select((e) =>
							sql<string>`generate_series(${e.ref('start.day')}, ${to.toString()}::date, interval '1 day')::date`.as(
								'day',
							),
						),
				)
				.with('changes', (q) =>
					q
						.selectFrom('dailyDeltas as d')
						.innerJoin('parts as x', 'x.accountId', 'd.accountId')
						.select((e) => [
							e('d.accountType', '=', AccountType.Assets).as('asset'),
							'x.part',
							'd.commodity',
							'd.date',
							e.fn.sum<bigint>('d.amount').as('amount'),
						])
						.where('d.ledgerId', '=', ledgerId)
						.where('d.accountType', 'in', BALANCE_TYPES)
						.where('d.date', '>=', startMonth)
						.where('d.date', '<=', to.toString())
						.groupBy(['d.accountType', 'x.part', 'd.commodity', 'd.date']),
				)
				.with('history', (q) =>
					q
						.selectFrom('months')
						.select([
							'months.asset',
							'months.part',
							'months.commodity',
							'months.month as date',
							'months.amount',
						])
						.where('months.month', '<', startMonth)
						.unionAll(
							q
								.selectFrom('changes')
								.select([
									'changes.asset',
									'changes.part',
									'changes.commodity',
									'changes.date',
									'changes.amount',
								]),
						),
				)
				.with('keys', (q) =>
					q
						.selectFrom('history as x')
						.leftJoin('own as o', 'o.symbol', 'x.commodity')
						.select((e) => [
							'x.asset',
							'x.part',
							'x.commodity',
							'o.id as symbolId',
							total(
								e.ref('x.amount'),
								e(
									'x.date',
									'<',
									e.selectFrom('days').select((d) => d.fn.min('days.day').as('day')),
								),
							).as('opening'),
						])
						.groupBy(['x.asset', 'x.part', 'x.commodity', 'o.id']),
				)
				.with('balances', (q) =>
					q
						.selectFrom('keys as k')
						.crossJoin('days as d')
						.leftJoin('changes as x', (j) =>
							j
								.onRef('x.asset', '=', 'k.asset')
								.onRef('x.part', '=', 'k.part')
								.onRef('x.commodity', '=', 'k.commodity')
								.onRef('x.date', '=', 'd.day'),
						)
						.select((e) => [
							'k.asset',
							'k.part',
							'k.commodity',
							'k.symbolId',
							'd.day',
							e(
								e.ref('k.opening'),
								'+',
								runningTotal(
									e.ref('x.amount'),
									[e.ref('k.asset'), e.ref('k.part'), e.ref('k.commodity')],
									e.ref('d.day'),
								),
							).as('units'),
						]),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, hops)', (q) =>
					q
						.selectFrom('balances as b')
						.select([
							'b.commodity as origin',
							'b.day',
							'b.commodity',
							'b.symbolId as at',
							sql<bigint>`${sql.lit(AMOUNT_UNIT)}::numeric`.as('rate'),
							sql<number>`0`.as('hops'),
						])
						.distinct()
						.where('b.commodity', '<>', DEFAULT_COMMODITY)
						.unionAll((r) =>
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
								.where('r.hops', '<', MAX_PRICES),
						),
				)
				.with('valued', (q) =>
					q
						.selectFrom('balances as b')
						.leftJoin('rates as r', (j) =>
							j
								.onRef('r.origin', '=', 'b.commodity')
								.onRef('r.day', '=', 'b.day')
								.on('r.commodity', '=', DEFAULT_COMMODITY),
						)
						.select((e) => [
							'b.day',
							'b.asset',
							'b.part',
							'b.commodity',
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
				.with('shares', (q) =>
					q
						.selectFrom('valued as v')
						.select((e) => [
							'v.day',
							'v.part',
							sql<string | null>`case when ${byCommodity} then ${e.ref('v.commodity')} end`.as(
								'commodity',
							),
							e.fn.sum<bigint>('v.value').as('value'),
						])
						.where('v.value', 'is not', null)
						.groupBy(['v.day', 'v.part', sql.ref('commodity')]),
				)
				.selectFrom('days as d')
				.leftJoin('valued as v', 'v.day', 'd.day')
				.select((e) => [
					'd.day',
					total(e.ref('v.value'), e('v.asset', '=', true)).as('assets'),
					total(e.ref('v.value'), e('v.asset', '=', false)).as('liabilities'),
					total(e.ref('v.value')).as('worth'),
					e
						.selectFrom('shares as s')
						.select(
							sql<
								{ account: string; commodity: string | null; amount: string }[]
							>`coalesce(jsonb_agg(jsonb_build_object('account', s.part, 'commodity', s.commodity, 'amount', s.value::text)), '[]')`.as(
								'parts',
							),
						)
						.whereRef('s.day', '=', 'd.day')
						.where('s.value', '<>', 0n)
						.as('parts'),
					unset(e.ref('v.value'), e.ref('v.commodity')).as('unpriced'),
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
				parts: (w.parts ?? []).map((p) => ({ ...p, amount: BigInt(p.amount) as Amount })),
				unpriced: w.unpriced,
			})),
		);
	});

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
						.unionAll((r) =>
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
								.where('r.hops', '<', MAX_PRICES),
						),
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

/** The ledger's own symbols, so each commodity is looked up once rather than once a day. */
const ownSymbols = (db: Database, ledgerId: string) =>
	db
		.selectFrom('symbols')
		.select(['symbols.id', 'symbols.symbol'])
		.where('symbols.feed', '=', Feed.Ledger)
		.where('symbols.ledgerId', '=', ledgerId);

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
