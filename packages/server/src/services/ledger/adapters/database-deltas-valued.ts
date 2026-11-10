import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { anyOf, total } from '#lib/server/db/expressions.ts';
import type { Bucket, Span } from '@rupea/shared/dates.ts';
import { sql } from 'kysely';
import { type Amount } from '../domain/amounts';
import type { Flow } from '../domain/returns';
import type { Delta } from '../domain/deltas';
import { AccountType, PriceKind } from '../domain/types';
import { deltasBetween } from './database-deltas';
import { multiply } from './database-queries';
import { inBase, ownSymbols, ratesOf } from './database-rates';

type DeltasOptions = {
	accounts: string[];
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	/**
	 * A day of the month puts every month's day n in one bucket, dated in January
	 * 2000.
	 */
	bucket: Bucket | 'dayOfMonth';
	base: string;
};

/**
 * What these accounts gained over a span, whatever their type, valued in the
 * base at the latest price on or before each amount's own day, as worth does,
 * and added up by account and the bucket its day falls in.
 */
export const listDeltas = (
	ledgerId: string,
	{ accounts, from, to, bucket, base }: DeltasOptions,
): ResultAsync<Delta[]> => {
	const grain = bucket === 'month' || bucket === 'year' ? 'month' : 'day';

	return withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('spent', (q) =>
					q
						.selectFrom(
							deltasBetween(db, ledgerId, { from, after: to.add({ days: 1 }), grain }).as('m'),
						)
						.innerJoin('accounts as a', 'a.id', 'm.accountId')
						.select((e) => [
							'a.name as account',
							'm.day as date',
							'm.commodity',
							sql<string | null>`null::uuid`.as('symbolId'),
							e.fn.sum<bigint>('m.amount').as('amount'),
							e.fn.sum<bigint>('m.inflow').as('inflow'),
							e.fn.sum<bigint>('m.outflow').as('outflow'),
							sql<bigint>`0::bigint`.as('postings'),
						])
						.where('m.commodity', '=', base)
						.where((e) => anyOf(e.ref('m.accountId'), accounts, 'uuid'))
						.groupBy(['a.name', 'm.day', 'm.commodity'])
						.unionAll(
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
							(bucket === 'dayOfMonth'
								? sql<string>`make_date(2000, 1, extract(day from ${e.ref('s.date')})::int)`
								: sql<string>`date_trunc(${bucket}, ${e.ref('s.date')}::timestamp)::date`
							).as('bucket'),
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
					e.fn.min('v.date').as('first'),
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
		).map((rows) => {
			const dates: Record<string, Temporal.PlainDate> = {};
			const dateOf = (t: string) => (dates[t] ??= Temporal.PlainDate.from(t));

			return rows.map((s) => ({
				account: s.account,
				bucket: dateOf(s.bucket),
				first: dateOf(s.first),
				amount: s.amount as Amount,
				inflow: s.inflow as Amount,
				outflow: s.outflow as Amount,
				unpriced: s.unpriced,
			}));
		}),
	);
};

type FlowsOptions = Span & { earning: string[]; base: string };

/**
 * What flowed into each Assets account on each day in the base: the value of
 * its counted postings, less its share of their transaction's net investment
 * income, which the earning accounts post. That income goes to the
 * transaction's Assets postings of commodities other than the base, or to its
 * base ones when it has none, split equally with what does not divide going to
 * the first. A posting is valued at its own price when it names one, then at
 * the latest price on or before its day, as worth does.
 */
export const listFlows = (
	ledgerId: string,
	{ earning, from, to, base }: FlowsOptions,
): ResultAsync<Flow[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.withRecursive('own(id, symbol)', () => ownSymbols(db, ledgerId))
				.with('moved', (q) =>
					q
						.selectFrom('postings as p')
						.innerJoin('accounts as a', 'a.id', 'p.accountId')
						.select((e) => [
							'p.transactionId',
							'p.position',
							'a.name as account',
							'p.date',
							anyOf(e.ref('p.accountId'), earning, 'uuid').as('earned'),
							e('p.commodity', '<>', base).as('held'),
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
						.where('p.date', '>=', from.toString())
						.where('p.date', '<=', to.toString())
						.where('p.counted', '=', true)
						.where((e) =>
							e.or([
								e('p.accountType', '=', AccountType.Assets),
								anyOf(e.ref('p.accountId'), earning, 'uuid'),
							]),
						),
				)
				.with('wanted', (q) =>
					q
						.selectFrom('moved as m')
						.leftJoin('own as o', 'o.symbol', 'm.commodity')
						.select(['m.commodity', 'm.date as day', 'o.id as at'])
						.distinct(),
				)
				.withRecursive('rates(origin, day, commodity, at, rate, path)', ratesOf(db, ledgerId, base))
				.with('valued', (q) =>
					q
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
								amount: e.ref('m.amount'),
								commodity: e.ref('m.commodity'),
								rate: e.ref('r.rate'),
								base,
							}).as('value'),
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
