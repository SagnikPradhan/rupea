import { anyOf } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Bucket } from '@rupea/shared/balances.ts';
import { sql, type QueryCreator, type RawBuilder } from 'kysely';
import { PriceKind } from '../domain/types';
import { type Amount } from '../domain/amounts';
import type { Delta } from '../domain/deltas';
import { hasCounter, type Filter } from '../domain/filters';
import { deltasBetween, postedBetween } from './database-deltas';
import { conditionFor } from './database-filters';
import { multiply } from './database-queries';
import { ownSymbols, ratesOf } from './database-rates';

type DeltasOptions = {
	accounts: string[];
	filter: Filter;
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: Bucket | 'posting';
	valued: 'then' | 'cost';
	base: string;
};

type Spending = DeltasOptions & { ledgerId: string };

/**
 * A day's bucket as the key the caller reads it by: the date, a day of the
 * month, which puts every month's day n in one bucket, then a month as 2026-10
 * and a year as 2026.
 */
export const KEYS: Record<Bucket, (date: RawBuilder<unknown>) => RawBuilder<string>> = {
	date: (d) => sql<string>`${d}::date::text`,
	day: (d) => sql<string>`extract(day from ${d}::date)::int::text`,
	month: (d) => sql<string>`to_char(${d}::date, 'YYYY-MM')`,
	year: (d) => sql<string>`to_char(${d}::date, 'YYYY')`,
};

/**
 * What these accounts gained over a span, whatever their type, valued in the
 * base at the latest price on or before each amount's own day, as worth does,
 * and added up by account and the bucket its day falls in. Valued at cost, a
 * posting that names a price is worth that price, as hledger's cost option has
 * it, and the rest are valued as they were. The bucket posting keeps each
 * posting alone, dated by its day, with its commodity, transaction and
 * position. Amounts in the base need no price, so a row may share its account
 * and bucket with another, and the caller adds them.
 */
export const listDeltas = (
	ledgerId: string,
	{ accounts, filter, from, to, bucket, valued, base }: DeltasOptions,
): ResultAsync<Delta[]> =>
	withContext('db')((db) => {
		const each = bucket === 'posting';
		const key = KEYS[each ? 'date' : bucket];
		const read = { ledgerId, accounts, filter, from, to, bucket, valued, base };

		return attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('spent', (q) => {
					if (valued === 'cost') return costSpentIn(db, { ...read, q });
					if (bucket === 'posting')
						return baseEachIn(db, read).unionAll(otherSpentIn(db, { ...read, q }));

					return baseSpentIn(db, { ...read, bucket }).unionAll(otherSpentIn(db, { ...read, q }));
				})
				.with('wanted', (q) =>
					q
						.selectFrom('spent as s')
						.select(['s.commodity', 's.date as day', 's.symbolId as at'])
						.where('s.commodity', '<>', base)
						.distinct(),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, path)', ratesOf(db, ledgerId, base))
				.with('valued', (q) =>
					q
						.selectFrom('spent as s')
						.select((e) => [
							's.account',
							key(sql`${e.ref('s.date')}`).as('bucket'),
							's.commodity',
							's.posted',
							's.transactionId',
							's.position',
							's.amount',
							's.inflow',
							's.outflow',
							sql<number>`0`.as('unpriced'),
						])
						.where('s.commodity', '=', base)
						.unionAll(
							q
								.selectFrom('spent as s')
								.leftJoin('rates as r', (j) =>
									j
										.onRef('r.origin', '=', 's.commodity')
										.onRef('r.day', '=', 's.date')
										.on('r.commodity', '=', base),
								)
								.select((e) => [
									's.account',
									key(sql`${e.ref('s.date')}`).as('bucket'),
									's.commodity',
									's.posted',
									's.transactionId',
									's.position',
									sql<bigint>`coalesce(${multiply(e.ref('s.amount'), e.ref('r.rate'))}, 0)`.as(
										'amount',
									),
									sql<bigint>`coalesce(${multiply(e.ref('s.inflow'), e.ref('r.rate'))}, 0)`.as(
										'inflow',
									),
									sql<bigint>`coalesce(${multiply(e.ref('s.outflow'), e.ref('r.rate'))}, 0)`.as(
										'outflow',
									),
									sql<number>`case when ${e.ref('r.rate')} is null then ${e.ref('s.postings')} else 0 end`.as(
										'unpriced',
									),
								])
								.where('s.commodity', '<>', base),
						),
				)
				.with('folded', (q) =>
					each
						? q.selectFrom('valued as v').selectAll()
						: q
								.selectFrom('valued as v')
								.select((e) => [
									'v.account',
									'v.bucket',
									sql<string>`null`.as('commodity'),
									sql<string>`null`.as('posted'),
									sql<string | null>`null::uuid`.as('transactionId'),
									sql<number | null>`null::integer`.as('position'),
									sql<bigint>`sum(${e.ref('v.amount')})`.as('amount'),
									sql<bigint>`sum(${e.ref('v.inflow')})`.as('inflow'),
									sql<bigint>`sum(${e.ref('v.outflow')})`.as('outflow'),
									sql<number>`sum(${e.ref('v.unpriced')})::integer`.as('unpriced'),
								])
								.groupBy(['v.account', 'v.bucket']),
				)
				.selectFrom('folded as f')
				.selectAll()
				.$if(!each, (q) => q.orderBy('f.account').orderBy('f.bucket'))
				.execute(),
		).map((rows) =>
			rows.map((s) => ({
				account: s.account,
				commodity: each ? s.posted : null,
				bucket: s.bucket,
				value: s.amount as Amount,
				inflow: s.inflow as Amount,
				outflow: s.outflow as Amount,
				units: 0n as Amount,
				cost: 0n as Amount,
				paid: 0n as Amount,
				price: null,
				unpriced: Number(s.unpriced),
				...(s.transactionId === null
					? {}
					: { transaction: s.transactionId, position: s.position ?? 0 }),
			})),
		);
	});

/**
 * What the base-currency postings of these accounts came to, added up by
 * account and the bucket their day falls in, grouped before the join to
 * accounts. A bucket of months or years reads the monthly rollup, and the rest
 * read the postings.
 */
const baseSpentIn = (db: Database, o: Spending & { bucket: Bucket }) => {
	const { ledgerId, accounts, filter, from, to, bucket, base } = o;
	const after = to.add({ days: 1 });
	const rolledUp = (bucket === 'month' || bucket === 'year') && !hasCounter(filter);
	const read = rolledUp
		? deltasBetween(db, ledgerId, { from, after, grain: 'month' })
		: postedBetween(db, ledgerId, { from, after, filter });

	return db
		.selectFrom((s) =>
			s
				.selectFrom(read.as('m'))
				.select((e) => [
					'm.accountId',
					'm.commodity',
					sql<string>`min(${e.ref('m.day')})`.as('date'),
					e.fn.sum<bigint>('m.amount').as('amount'),
					e.fn.sum<bigint>('m.inflow').as('inflow'),
					e.fn.sum<bigint>('m.outflow').as('outflow'),
				])
				.where('m.commodity', '=', base)
				.where((e) => anyOf(e.ref('m.accountId'), accounts, 'uuid'))
				.$if(rolledUp, (q) =>
					q.where((e) =>
						conditionFor(db, {
							filter,
							ledgerId,
							account: e.ref('m.accountId'),
							transaction: null,
						}),
					),
				)
				.groupBy((e) => ['m.accountId', 'm.commodity', KEYS[bucket](sql`${e.ref('m.day')}`)])
				.as('g'),
		)
		.innerJoin('accounts as a', 'a.id', 'g.accountId')
		.select([
			'a.name as account',
			'g.date',
			'g.commodity',
			'g.commodity as posted',
			sql<string | null>`null::uuid`.as('symbolId'),
			sql<string | null>`null::uuid`.as('transactionId'),
			sql<number | null>`null::integer`.as('position'),
			'g.amount',
			'g.inflow',
			'g.outflow',
			sql<bigint>`0::bigint`.as('postings'),
		]);
};

/** Each base-currency posting of these accounts that passes the filter, alone. */
const baseEachIn = (db: Database, o: Spending) => {
	const { ledgerId, accounts, filter, from, to, base } = o;

	return db
		.selectFrom('postings as p')
		.innerJoin('accounts as a', 'a.id', 'p.accountId')
		.select((e) => [
			'a.name as account',
			'p.date',
			'p.commodity',
			'p.commodity as posted',
			sql<string | null>`null::uuid`.as('symbolId'),
			sql<string | null>`${e.ref('p.transactionId')}`.as('transactionId'),
			sql<number | null>`${e.ref('p.position')}`.as('position'),
			'p.amount',
			sql<bigint>`greatest(${e.ref('p.amount')}, 0)`.as('inflow'),
			sql<bigint>`greatest(-${e.ref('p.amount')}, 0)`.as('outflow'),
			sql<bigint>`1::bigint`.as('postings'),
		])
		.where('p.ledgerId', '=', ledgerId)
		.where('p.commodity', '=', base)
		.where('p.counted', '=', true)
		.where((e) => anyOf(e.ref('p.accountId'), accounts, 'uuid'))
		.where((e) =>
			conditionFor(db, {
				filter,
				ledgerId,
				account: e.ref('p.accountId'),
				transaction: e.ref('p.transactionId'),
			}),
		)
		.where('p.date', '>=', from.toString())
		.where('p.date', '<=', to.toString());
};

/**
 * What the postings of these accounts in a commodity other than the base came
 * to, added up by account, day and commodity, or each alone for the bucket
 * posting, with the symbol the ledger prices the commodity by.
 */
type Own = { own: { id: string; symbol: string } };

const otherSpentIn = (db: Database, o: Spending & { q: QueryCreator<Tables & Own> }) => {
	const { q, ledgerId, accounts, filter, from, to, bucket, base } = o;
	const each = bucket === 'posting';

	return q
		.selectFrom('postings as p')
		.innerJoin('accounts as a', 'a.id', 'p.accountId')
		.leftJoin('own as o', 'o.symbol', 'p.commodity')
		.select((e) => [
			'a.name as account',
			'p.date',
			'p.commodity',
			'p.commodity as posted',
			'o.id as symbolId',
			sql<string | null>`${each ? e.ref('p.transactionId') : sql`null::uuid`}`.as('transactionId'),
			sql<number | null>`${each ? e.ref('p.position') : sql`null::integer`}`.as('position'),
			e.fn.sum<bigint>('p.amount').as('amount'),
			sql<bigint>`sum(greatest(${e.ref('p.amount')}, 0))`.as('inflow'),
			sql<bigint>`sum(greatest(-${e.ref('p.amount')}, 0))`.as('outflow'),
			e.fn.countAll<bigint>().as('postings'),
		])
		.where('p.ledgerId', '=', ledgerId)
		.where('p.commodity', '<>', base)
		.where('p.counted', '=', true)
		.where((e) => anyOf(e.ref('p.accountId'), accounts, 'uuid'))
		.where((e) =>
			conditionFor(db, {
				filter,
				ledgerId,
				account: e.ref('p.accountId'),
				transaction: e.ref('p.transactionId'),
			}),
		)
		.where('p.date', '>=', from.toString())
		.where('p.date', '<=', to.toString())
		.groupBy(
			each
				? ['a.name', 'p.date', 'p.commodity', 'o.id', 'p.transactionId', 'p.position']
				: ['a.name', 'p.date', 'p.commodity', 'o.id'],
		);
};

/**
 * What the postings of these accounts came to at cost, added up by account, day
 * and the commodity they are worth in, or each alone for the bucket posting: a
 * posting that names a price is worth that price in its commodity, and the rest
 * are worth their own.
 */
const costSpentIn = (db: Database, o: Spending & { q: QueryCreator<Tables & Own> }) => {
	const { q, ledgerId, accounts, filter, from, to, bucket } = o;
	const each = bucket === 'posting';

	return q
		.selectFrom((s) =>
			s
				.selectFrom('postings as p')
				.select((e) => {
					const amount = e
						.case()
						.when('p.priceKind', '=', PriceKind.Unit)
						.then(multiply(e.ref('p.amount'), e.ref('p.priceAmount')))
						.when('p.priceKind', '=', PriceKind.Total)
						.then(sql<bigint>`sign(${e.ref('p.amount')}) * ${e.ref('p.priceAmount')}`)
						.else(e.ref('p.amount'))
						.end();

					return [
						'p.accountId',
						'p.date',
						e.fn.coalesce('p.priceCommodity', 'p.commodity').as('commodity'),
						'p.commodity as posted',
						sql<string | null>`${each ? e.ref('p.transactionId') : sql`null::uuid`}`.as(
							'transactionId',
						),
						sql<number | null>`${each ? e.ref('p.position') : sql`null::integer`}`.as('position'),
						sql<bigint>`sum(${amount})`.as('amount'),
						sql<bigint>`sum(greatest(${amount}, 0))`.as('inflow'),
						sql<bigint>`sum(greatest(-${amount}, 0))`.as('outflow'),
						e.fn.countAll<bigint>().as('postings'),
					];
				})
				.where('p.ledgerId', '=', ledgerId)
				.where('p.counted', '=', true)
				.where((e) => anyOf(e.ref('p.accountId'), accounts, 'uuid'))
				.where((e) =>
					conditionFor(db, {
						filter,
						ledgerId,
						account: e.ref('p.accountId'),
						transaction: e.ref('p.transactionId'),
					}),
				)
				.where('p.date', '>=', from.toString())
				.where('p.date', '<=', to.toString())
				.groupBy((e) => [
					'p.accountId',
					'p.date',
					e.fn.coalesce('p.priceCommodity', 'p.commodity'),
					'p.commodity',
					...(each ? (['p.transactionId', 'p.position'] as const) : []),
				])
				.as('g'),
		)
		.innerJoin('accounts as a', 'a.id', 'g.accountId')
		.leftJoin('own as o', 'o.symbol', 'g.commodity')
		.select([
			'a.name as account',
			'g.date',
			'g.commodity',
			'g.posted',
			'o.id as symbolId',
			'g.transactionId',
			'g.position',
			'g.amount',
			'g.inflow',
			'g.outflow',
			'g.postings',
		]);
};
