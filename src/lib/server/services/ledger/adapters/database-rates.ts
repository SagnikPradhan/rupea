import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Database } from '#lib/server/db/index.ts';
import { sql, type Expression, type ExpressionBuilder, type QueryCreator } from 'kysely';
import { AMOUNT_UNIT, type Amount, type Quantity } from '../domain/amounts';
import type { RateThen } from '../domain/cost';
import { Feed, PriceSource } from '../domain/types';
import { multiply } from './database-queries';

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

/**
 * What one unit of each commodity was worth in the base on each of its days, at the latest price
 * on or before that day, through as many prices as it takes. A pair with no price is left out.
 */
type RatesOptions = { pairs: { commodity: string; day: Temporal.PlainDate }[]; base: string };

export const listRates = (
	ledgerId: string,
	{ pairs, base }: RatesOptions,
): ResultAsync<RateThen[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('wanted', (q) =>
					q
						.selectFrom(
							sql<{
								commodity: string;
								day: string;
							}>`(select * from unnest(${pairs.map((p) => p.commodity)}::text[], ${pairs.map((p) => p.day.toString())}::date[]) as u(commodity, day))`.as(
								'm',
							),
						)
						.leftJoin('own as o', 'o.symbol', 'm.commodity')
						.select(['m.commodity', 'm.day', 'o.id as at']),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, path)', ratesOf(db, ledgerId, base))
				.selectFrom('rates as r')
				.select(['r.origin', 'r.day', 'r.rate'])
				.where('r.commodity', '=', base)
				.execute(),
		).map((rows) =>
			rows.map((r) => ({
				commodity: r.origin,
				day: Temporal.PlainDate.from(r.day),
				rate: r.rate as Amount,
			})),
		),
	);

type InBaseOptions = {
	amount: Expression<bigint>;
	commodity: Expression<string>;
	rate: Expression<bigint | null>;
	base: string;
};

/** An amount in the base: itself when it is, else at its rate, which is null when no price reaches the base. */
export const inBase = ({ amount, commodity, rate, base }: InBaseOptions) =>
	sql<
		bigint | null
	>`case when ${commodity} = ${base} then ${amount} else ${multiply(amount, rate)} end`;

/** The ledger's own symbols, so each commodity is looked up once rather than once a day. */
export const ownSymbols = (db: Database, ledgerId: string) =>
	db
		.selectFrom('symbols')
		.select(['symbols.id', 'symbols.symbol'])
		.where('symbols.feed', '=', Feed.Ledger)
		.where('symbols.ledgerId', '=', ledgerId);

type Converting = {
	wanted: { commodity: string; day: string; at: string | null };
	rates: {
		origin: string;
		day: string;
		commodity: string;
		at: string | null;
		rate: bigint;
		path: string[];
	};
	own: { id: string; symbol: string };
};

/** Each wanted commodity and day at a rate of one for itself, then through its prices to the base. */
export const ratesOf =
	(db: Database, ledgerId: string, base: string) => (q: QueryCreator<Converting>) =>
		q
			.selectFrom('wanted as w')
			.select([
				'w.commodity as origin',
				'w.day',
				'w.commodity',
				'w.at',
				sql<bigint>`${sql.lit(AMOUNT_UNIT)}::numeric`.as('rate'),
				sql<string[]>`array[${sql.ref('w.commodity')}]`.as('path'),
			])
			.where('w.commodity', '<>', base)
			.unionAll(nextRate(db, ledgerId, base));

/** Each commodity's next price on its way to the base, from the one the rate reached last, never to a commodity it has been through, so prices that go round end. */
const nextRate =
	(db: Database, ledgerId: string, base: string) => (r: ExpressionBuilder<Converting, never>) =>
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
				sql<string[]>`array_append(${e.ref('r.path')}, ${e.ref('p.currency')})`.as('path'),
			])
			.where('r.commodity', '<>', base)
			.where((e) => sql<boolean>`not ${e.ref('p.currency')} = any(${e.ref('r.path')})`);

type PriceOnOptions = {
	symbolId: Expression<string | null>;
	commodity: Expression<string>;
	day: Expression<string>;
};

/**
 * The latest price of a commodity on or before a day, from the ledger's own symbol or the feed it
 * links to on that day. On one day a P line beats an at-price, and either beats a feed's quote.
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

/** The latest quote on or before a day of the feed a commodity links to on that day. */
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
