import { anyOf, total } from '#lib/server/db/expressions.ts';
import type { Database } from '#lib/server/db/index.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Bucket } from '@rupea/shared/balances.ts';
import type { Span } from '@rupea/shared/dates.ts';
import { sql, type RawBuilder } from 'kysely';
import { type Amount } from '../domain/amounts';
import type { Delta } from '../domain/deltas';
import { flowsOf } from '../domain/flows';
import type { Flow } from '../domain/returns';
import { AccountType, PriceKind } from '../domain/types';
import { deltasBetween, postedBetween } from './database-deltas';
import { multiply } from './database-queries';
import { inBase, ownSymbols, ratesOf } from './database-rates';

type DeltasOptions = {
	accounts: string[];
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: Bucket;
	base: string;
};

/**
 * A day's bucket as the key the caller reads it by: the date, a day of the
 * month, which puts every month's day n in one bucket, then a month as 2026-10
 * and a year as 2026.
 */
const KEYS: Record<Bucket, (date: RawBuilder<unknown>) => RawBuilder<string>> = {
	date: (d) => sql<string>`to_char(${d}::date, 'YYYY-MM-DD')`,
	day: (d) => sql<string>`extract(day from ${d}::date)::int::text`,
	month: (d) => sql<string>`to_char(${d}::date, 'YYYY-MM')`,
	year: (d) => sql<string>`to_char(${d}::date, 'YYYY')`,
};

/**
 * What these accounts gained over a span, whatever their type, valued in the
 * base at the latest price on or before each amount's own day, as worth does,
 * and added up by account and the bucket its day falls in.
 */
export const listDeltas = (
	ledgerId: string,
	{ accounts, from, to, bucket, base }: DeltasOptions,
): ResultAsync<Delta[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('spent', (q) =>
					baseSpentIn(db, { ledgerId, accounts, from, to, bucket, base }).unionAll(
						q
							.selectFrom('postings as p')
							.innerJoin('accounts as a', 'a.id', 'p.accountId')
							.leftJoin('own as o', 'o.symbol', 'p.commodity')
							.select((e) => [
								'a.name as account',
								'p.date',
								'p.commodity',
								'o.id as symbolId',
								e.fn.sum<bigint>('p.amount').as('amount'),
								sql<bigint>`sum(greatest(${e.ref('p.amount')}, 0))`.as('inflow'),
								sql<bigint>`sum(greatest(-${e.ref('p.amount')}, 0))`.as('outflow'),
								e.fn.countAll<bigint>().as('postings'),
							])
							.where('p.ledgerId', '=', ledgerId)
							.where('p.commodity', '<>', base)
							.where('p.counted', '=', true)
							.where((e) => anyOf(e.ref('p.accountId'), accounts, 'uuid'))
							.where('p.date', '>=', from.toString())
							.where('p.date', '<=', to.toString())
							.groupBy(['a.name', 'p.date', 'p.commodity', 'o.id']),
					),
				)
				.with('wanted', (q) =>
					q
						.selectFrom('spent as s')
						.select(['s.commodity', 's.date as day', 's.symbolId as at'])
						.distinct(),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, path)', ratesOf(db, ledgerId, base))
				.with('valued', (q) =>
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
							's.date',
							's.postings',
							KEYS[bucket](sql`${e.ref('s.date')}`).as('bucket'),
							inBase({
								amount: e.ref('s.amount'),
								commodity: e.ref('s.commodity'),
								rate: e.ref('r.rate'),
								base,
							}).as('value'),
							inBase({
								amount: e.ref('s.inflow'),
								commodity: e.ref('s.commodity'),
								rate: e.ref('r.rate'),
								base,
							}).as('inflow'),
							inBase({
								amount: e.ref('s.outflow'),
								commodity: e.ref('s.commodity'),
								rate: e.ref('r.rate'),
								base,
							}).as('outflow'),
						]),
				)
				.selectFrom('valued as v')
				.select((e) => [
					'v.account',
					'v.bucket',
					total(e.ref('v.value')).as('amount'),
					total(e.ref('v.inflow')).as('inflow'),
					total(e.ref('v.outflow')).as('outflow'),
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
				commodity: null,
				bucket: s.bucket,
				value: s.amount as Amount,
				inflow: s.inflow as Amount,
				outflow: s.outflow as Amount,
				units: 0n as Amount,
				cost: 0n as Amount,
				paid: 0n as Amount,
				price: null,
				unpriced: s.unpriced,
			})),
		),
	);

/**
 * What the base-currency postings of these accounts came to, added up by
 * account and the bucket their day falls in, grouped before the join to
 * accounts. A bucket of months or years reads the monthly rollup, and the rest
 * read the postings.
 */
const baseSpentIn = (
	db: Database,
	{ ledgerId, accounts, from, to, bucket, base }: DeltasOptions & { ledgerId: string },
) => {
	const grain = bucket === 'month' || bucket === 'year' ? 'month' : 'day';
	const read = grain === 'day' ? postedBetween : deltasBetween;

	return db
		.selectFrom((s) =>
			s
				.selectFrom(read(db, ledgerId, { from, after: to.add({ days: 1 }), grain }).as('m'))
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
				.groupBy((e) => ['m.accountId', 'm.commodity', KEYS[bucket](sql`${e.ref('m.day')}`)])
				.as('g'),
		)
		.innerJoin('accounts as a', 'a.id', 'g.accountId')
		.select([
			'a.name as account',
			'g.date',
			'g.commodity',
			sql<string | null>`null::uuid`.as('symbolId'),
			'g.amount',
			'g.inflow',
			'g.outflow',
			sql<bigint>`0::bigint`.as('postings'),
		]);
};

type FlowsOptions = Span & { earning: string[]; base: string };

type Moving = FlowsOptions & { ledgerId: string };

const MOVED_BY = [
	'x.account',
	'x.date',
	'x.commodity',
	'x.transactionId',
	'x.position',
	'x.earned',
	'x.held',
] as const;

/**
 * What flowed into each Assets account on each day in the base: the value of
 * its counted postings, less its share of their transaction's net investment
 * income, which the earning accounts post. That income goes to the
 * transaction's Assets postings of commodities other than the base, or to its
 * base ones when it has none, split equally with what does not divide going to
 * the first. A posting is valued at its own price when it names one, then at
 * the latest price on or before its day, as worth does.
 *
 * Postings come added up by account and day, except those of a transaction with
 * an earning posting and those valued in another commodity, which come one by
 * one for flowsOf to share the income between.
 */
export const listFlows = (
	ledgerId: string,
	{ earning, from, to, base }: FlowsOptions,
): ResultAsync<Flow[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('moved', () => movedIn(db, { ledgerId, earning, from, to, base }))
				.with('wanted', (q) =>
					q
						.selectFrom('moved as m')
						.leftJoin('own as o', 'o.symbol', 'm.commodity')
						.select(['m.commodity', 'm.date as day', 'o.id as at'])
						.where('m.commodity', '<>', base)
						.distinct(),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, path)', ratesOf(db, ledgerId, base))
				.selectFrom('moved as m')
				.leftJoin('rates as r', (j) =>
					j
						.onRef('r.origin', '=', 'm.commodity')
						.onRef('r.day', '=', 'm.date')
						.on('r.commodity', '=', base),
				)
				.select((e) => [
					'm.transactionId',
					'm.position',
					'm.account',
					'm.date',
					'm.earned',
					'm.held',
					inBase({
						base,
						amount: e.ref('m.amount'),
						commodity: e.ref('m.commodity'),
						rate: e.ref('r.rate'),
					}).as('amount'),
				])
				.execute(),
		).map((rows) =>
			flowsOf(
				rows.map((r) => ({
					transactionId: r.transactionId,
					position: r.position ?? 0,
					account: r.account,
					date: r.date,
					amount: r.amount as Amount | null,
					unpriced: 0,
					earned: r.earned,
					held: r.held,
				})),
			),
		),
	);

/**
 * Each counted posting of the Assets and earning accounts, valued at its own
 * price when it names one, added up by account, day and commodity. Those of a
 * transaction with an earning posting, or held in another commodity than the
 * base, keep their transaction and position, which is what tells them apart
 * from the rest.
 */
const movedIn = (db: Database, { ledgerId, earning, from, to, base }: Moving) =>
	db
		.selectFrom((s) =>
			s
				.selectFrom('postings as p')
				.innerJoin('accounts as a', 'a.id', 'p.accountId')
				.leftJoin(earningIn(db, { ledgerId, earning, from, to, base }).as('g'), (j) =>
					j.onRef('g.transactionId', '=', 'p.transactionId'),
				)
				.select((e) => {
					const commodity = e.fn.coalesce('p.priceCommodity', 'p.commodity');
					const one = sql<boolean>`(${e.ref('g.transactionId')} is not null or ${commodity} <> ${base})`;
					const earned = anyOf(e.ref('p.accountId'), earning, 'uuid');
					const amount = e
						.case()
						.when('p.priceKind', '=', PriceKind.Unit)
						.then(multiply(e.ref('p.amount'), e.ref('p.priceAmount')))
						.when('p.priceKind', '=', PriceKind.Total)
						.then(sql<bigint>`sign(${e.ref('p.amount')}) * ${e.ref('p.priceAmount')}`)
						.else(e.ref('p.amount'))
						.end();

					return [
						'a.name as account',
						'p.date',
						commodity.as('commodity'),
						amount.as('amount'),
						sql<string | null>`case when ${one} then ${e.ref('p.transactionId')} end`.as(
							'transactionId',
						),
						sql<number | null>`case when ${one} then ${e.ref('p.position')} end`.as('position'),
						sql<boolean>`${one} and ${earned}`.as('earned'),
						sql<boolean>`${one} and ${e('p.commodity', '<>', base)}`.as('held'),
					];
				})
				.where('p.ledgerId', '=', ledgerId)
				.where('p.date', '>=', from.toString())
				.where('p.date', '<=', to.toString())
				.where('p.counted', '=', true)
				.where((e) =>
					e.or([
						e('p.accountType', '=', AccountType.Assets),
						anyOf(e.ref('p.accountId'), earning, 'uuid'),
					]),
				)
				.as('x'),
		)
		.select((e) => [...MOVED_BY, e.fn.sum<bigint>('x.amount').as('amount')])
		.groupBy(MOVED_BY);

/** The transactions with a counted posting on an earning account in the span. */
const earningIn = (db: Database, { ledgerId, earning, from, to }: Moving) =>
	db
		.selectFrom('postings as p')
		.select('p.transactionId')
		.where('p.ledgerId', '=', ledgerId)
		.where('p.date', '>=', from.toString())
		.where('p.date', '<=', to.toString())
		.where('p.counted', '=', true)
		.where((e) => anyOf(e.ref('p.accountId'), earning, 'uuid'))
		.distinct();
