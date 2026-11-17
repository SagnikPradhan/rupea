import { anyOf } from '#lib/server/db/expressions.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Bucket } from '@rupea/shared/balances.ts';
import { BEGINNING } from '@rupea/shared/dates.ts';
import { sql } from 'kysely';
import type { Amount } from '../domain/amounts';
import { deltasBetween } from './database-deltas';
import { KEYS } from './database-deltas-valued';

type OpeningsOptions = { accounts: string[]; before: Temporal.PlainDate };

type Opening = { accountId: string; commodity: string; units: Amount };

/**
 * What these accounts held of each commodity before a day: the monthly deltas
 * of the months before it and at most a month of days. A holding that moved and
 * came back to nothing is listed too.
 */
export const listOpenings = (
	ledgerId: string,
	{ accounts, before }: OpeningsOptions,
): ResultAsync<Opening[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom(
					deltasBetween(db, ledgerId, {
						from: Temporal.PlainDate.from(BEGINNING),
						after: before,
					}).as('m'),
				)
				.select((e) => ['m.accountId', 'm.commodity', e.fn.sum<Amount>('m.amount').as('units')])
				.where((e) => anyOf(e.ref('m.accountId'), accounts, 'uuid'))
				.groupBy(['m.accountId', 'm.commodity'])
				.execute(),
		),
	);

type UnitDeltasOptions = {
	accounts: string[];
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	bucket: Exclude<Bucket, 'day'>;
};

type UnitDelta = { accountId: string; commodity: string; bucket: string; units: Amount };

/**
 * What these accounts gained of each commodity over a span, in units and not
 * valued, by the bucket its day falls in. A bucket of months or years reads the
 * monthly deltas for the months it holds whole, and a bucket of dates adds up
 * the counted postings of its days over the whole span, so the caller guards
 * how long that span is.
 */
export const listUnitDeltas = (
	ledgerId: string,
	{ accounts, from, to, bucket }: UnitDeltasOptions,
): ResultAsync<UnitDelta[]> =>
	withContext('db')((db) =>
		attempt(() =>
			bucket === 'date'
				? db
						.selectFrom('postings as p')
						.select((e) => [
							'p.accountId',
							'p.commodity',
							KEYS.date(sql`${e.ref('p.date')}`).as('bucket'),
							e.fn.sum<Amount>('p.amount').as('units'),
						])
						.where('p.ledgerId', '=', ledgerId)
						.where('p.counted', '=', true)
						.where('p.date', '>=', from.toString())
						.where('p.date', '<', to.add({ days: 1 }).toString())
						.where((e) => anyOf(e.ref('p.accountId'), accounts, 'uuid'))
						.groupBy((e) => ['p.accountId', 'p.commodity', KEYS.date(sql`${e.ref('p.date')}`)])
						.execute()
				: db
						.selectFrom(deltasBetween(db, ledgerId, { from, after: to.add({ days: 1 }) }).as('m'))
						.select((e) => [
							'm.accountId',
							'm.commodity',
							KEYS[bucket](sql`${e.ref('m.day')}`).as('bucket'),
							e.fn.sum<Amount>('m.amount').as('units'),
						])
						.where((e) => anyOf(e.ref('m.accountId'), accounts, 'uuid'))
						.groupBy((e) => ['m.accountId', 'm.commodity', KEYS[bucket](sql`${e.ref('m.day')}`)])
						.execute(),
		),
	);
