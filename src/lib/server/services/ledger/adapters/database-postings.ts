import { noneOf } from '#lib/server/db/expressions.ts';
import { readOnly } from '#lib/server/db/read-only.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SqlBool } from 'kysely';
import { AMOUNT_UNIT, type Amount } from '../domain/amounts';
import type { Holding } from '../domain/holdings';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { RupeeParseLocation, RupeePosting } from '../domain/types';
import {
	before,
	inAccount,
	listed,
	newestFirst,
	timeKey,
	toCost,
	toPrice,
	toQuantity,
} from './database-queries';
import type { Page, PageOptions } from './database-transactions';

/** Where a page of postings starts: just past this one, newest first. */
export type PostingCursor = { date: string; time: string; id: string; position: number };

export type ListedPosting = {
	transaction: string;
	position: number;
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	description: string;
	posting: RupeePosting;
};

// `unordered` holds postings that could fall either side of the assertion.
export type BalanceCheck = {
	location: RupeeParseLocation;
	account: string;
	commodity: string;
	expected: Amount;
	actual: Amount;
	unordered: string[];
};

// Evidence is kept but not counted, so it has no postings to list.
export const listPostings = (
	ledgerId: string,
	{ filter, after, limit }: PageOptions<PostingCursor>,
): ResultAsync<Page<ListedPosting, PostingCursor>> =>
	readOnly(async (kysely) => {
		const rows = await kysely
			.selectFrom('postings')
			.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
			.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
			.select([
				'ledgerFiles.key as file',
				'transactions.line',
				'transactions.id',
				'transactions.date',
				sql<string>`${timeKey}::text`.as('time'),
				'transactions.description',
				'postings.position',
				'postings.account',
				'postings.amount',
				'postings.commodity',
				'postings.priceAmount',
				'postings.priceCommodity',
				'postings.priceKind',
				'postings.costAmount',
				'postings.costCommodity',
				'postings.costDate',
				'postings.balance',
			])
			.where((eb) =>
				eb.and([
					listed(ledgerId, filter)(eb),
					eb('transactions.counted', '=', true),
					...(filter.account === null ? [] : [inAccount(filter.account)]),
					...(after === null ? [] : [eb.or([before(after), atAfter(after)])]),
				]),
			)
			.orderBy(newestFirst)
			.orderBy('postings.position')
			.limit(limit)
			.execute();

		const last = rows.length === limit ? rows.at(-1) : undefined;
		return {
			rows: rows.map((r) => ({
				transaction: r.id,
				position: r.position,
				location: { file: r.file, line: r.line },
				date: Temporal.PlainDate.from(r.date),
				description: r.description,
				posting: {
					account: r.account,
					amount: r.amount as Amount,
					commodity: r.commodity,
					price: toPrice(r),
					cost: toCost(r),
					balance: r.balance as Amount | null,
					metadata: {},
				},
			})),
			next: last
				? { date: last.date, time: last.time, id: last.id, position: last.position }
				: null,
		};
	});

export const listAccountNames = (ledgerId: string): ResultAsync<string[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.selectFrom('postings')
				.select('postings.account')
				.distinct()
				.where('postings.ledgerId', '=', ledgerId)
				.orderBy('postings.account')
				.execute(),
		).map((r) => r.map((a) => a.account)),
	);

export const listHoldings = (ledgerId: string): ResultAsync<Holding[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.with('balances', (qb) =>
					qb
						.selectFrom('postings')
						.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
						.select([
							'postings.account',
							'postings.commodity',
							sql<string>`sum(${sql.ref('postings.amount')})::text`.as('units'),
						])
						.where('postings.ledgerId', '=', ledgerId)
						.where('postings.accountType', 'in', BALANCE_TYPES)
						.where('transactions.counted', '=', true)
						.groupBy(['postings.account', 'postings.commodity'])
						.having(sql<SqlBool>`sum(${sql.ref('postings.amount')}) <> 0`),
				)
				.with('costs', (qb) =>
					qb
						.selectFrom('lots')
						.select([
							'lots.account',
							'lots.commodity',
							sql<string>`sum(round(${sql.ref('lots.remaining')}::numeric * ${sql.ref('lots.costAmount')} / ${sql.lit(AMOUNT_UNIT)}))::text`.as(
								'costAmount',
							),
							sql<
								string | null
							>`case when count(distinct ${sql.ref('lots.costCommodity')}) = 1 then min(${sql.ref('lots.costCommodity')}) end`.as(
								'costCommodity',
							),
						])
						.where('lots.ledgerId', '=', ledgerId)
						.where('lots.remaining', '!=', 0n)
						.groupBy(['lots.account', 'lots.commodity']),
				)
				.selectFrom('balances')
				.leftJoin('costs', (j) =>
					j
						.onRef('costs.account', '=', 'balances.account')
						.onRef('costs.commodity', '=', 'balances.commodity'),
				)
				.select([
					'balances.account',
					'balances.commodity',
					'balances.units',
					'costs.costAmount',
					'costs.costCommodity',
				])
				.orderBy('balances.account')
				.orderBy('balances.commodity')
				.execute(),
		).map((rows) =>
			rows.map((row) => ({
				account: row.account,
				commodity: row.commodity,
				units: BigInt(row.units) as Amount,
				cost: toQuantity({
					amount: row.costAmount === null ? null : BigInt(row.costAmount),
					commodity: row.costCommodity,
				}),
			})),
		),
	);

// An assertion is a point in time on its account: every counted posting before
// it, in any file. A file is a sequence, so its own postings that day are
// ordered by line; another file's are ordered only when both sides have a time.
export const listBalanceChecks = (
	ledgerId: string,
	uncounted: string[],
): ResultAsync<BalanceCheck[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.with('asserted', (q) =>
					q
						.selectFrom('postings')
						.select(['postings.account', 'postings.commodity'])
						.distinct()
						.where('postings.ledgerId', '=', ledgerId)
						.where('postings.balance', 'is not', null),
				)
				.with('entries', (q) =>
					q
						.selectFrom('postings')
						.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
						.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
						.innerJoin('asserted', (j) =>
							j
								.onRef('asserted.account', '=', 'postings.account')
								.onRef('asserted.commodity', '=', 'postings.commodity'),
						)
						.select([
							'ledgerFiles.key as file',
							'transactions.line',
							'transactions.date',
							'transactions.time',
							'postings.position',
							'postings.account',
							'postings.commodity',
							'postings.amount',
							'postings.balance',
							noneOf('transactions.id', uncounted, 'uuid').as('counted'),
						])
						.where('postings.ledgerId', '=', ledgerId),
				)
				.with('days', (q) =>
					q
						.selectFrom('entries')
						.select((e) => [
							'entries.account',
							'entries.commodity',
							'entries.date',
							e.fn
								.coalesce(
									e.fn.sum<bigint>('entries.amount').filterWhere('entries.counted', '=', true),
									sql.lit(0n),
								)
								.as('total'),
						])
						.groupBy(['entries.account', 'entries.commodity', 'entries.date']),
				)
				.with('openings', (q) =>
					q.selectFrom('days').select((e) => [
						'days.account',
						'days.commodity',
						'days.date',
						e(
							e.fn
								.sum<bigint>('days.total')
								.over((o) =>
									o.partitionBy(['days.account', 'days.commodity']).orderBy('days.date'),
								),
							'-',
							e.ref('days.total'),
						).as('opening'),
					]),
				)
				.with('checks', (q) =>
					q
						.selectFrom('entries as a')
						.innerJoin('openings as o', (j) =>
							j
								.onRef('o.account', '=', 'a.account')
								.onRef('o.commodity', '=', 'a.commodity')
								.onRef('o.date', '=', 'a.date'),
						)
						.leftJoin('entries as e', (j) =>
							j
								.onRef('e.account', '=', 'a.account')
								.onRef('e.commodity', '=', 'a.commodity')
								.onRef('e.date', '=', 'a.date')
								.on('e.counted', '=', true),
						)
						.select((x) => {
							const sameFile = x('e.file', '=', x.ref('a.file'));
							const otherFile = x('e.file', '!=', x.ref('a.file'));
							const earlierInFile = x.and([
								sameFile,
								x.or([
									x('e.line', '<', x.ref('a.line')),
									x.and([
										x('e.line', '=', x.ref('a.line')),
										x('e.position', '<=', x.ref('a.position')),
									]),
								]),
							]);
							const earlierInOther = x.and([otherFile, x('e.time', '<', x.ref('a.time'))]);
							const unsure = x.and([
								otherFile,
								x.or([
									x('e.time', 'is', null),
									x('a.time', 'is', null),
									x('e.time', '=', x.ref('a.time')),
								]),
							]);

							return [
								'a.file',
								'a.line',
								'a.account',
								'a.commodity',
								'a.balance',
								x(
									x.ref('o.opening'),
									'+',
									x.fn.coalesce(
										x.fn.sum<bigint>('e.amount').filterWhere(x.or([earlierInFile, earlierInOther])),
										sql.lit(0n),
									),
								).as('actual'),
								x.fn
									.coalesce(
										x.fn
											.agg<string[]>('array_agg', [
												sql`${x.ref('e.file')} || ':' || ${x.ref('e.line')}`,
											])
											.distinct()
											.filterWhere(unsure),
										sql<string[]>`'{}'`,
									)
									.as('unordered'),
							];
						})
						.where('a.balance', 'is not', null)
						.groupBy([
							'a.file',
							'a.line',
							'a.position',
							'a.account',
							'a.commodity',
							'a.balance',
							'o.opening',
						]),
				)
				.selectFrom('checks')
				.select([
					'file',
					'line',
					'account',
					'commodity',
					'balance as expected',
					'actual',
					'unordered',
				])
				.where((e) =>
					e.or([
						e('balance', '!=', e.ref('actual')),
						e(e.fn('cardinality', ['unordered']), '>', 0),
					]),
				)
				.orderBy('file')
				.orderBy('line')
				.execute(),
		).map((rows) =>
			rows.map((c) => ({
				location: { file: c.file, line: c.line },
				account: c.account,
				commodity: c.commodity,
				expected: c.expected as Amount,
				actual: c.actual as Amount,
				unordered: c.unordered,
			})),
		),
	);

const atAfter = (c: PostingCursor) =>
	sql<SqlBool>`(${sql.ref('transactions.date')}, ${timeKey}, ${sql.ref('transactions.id')}) = (${c.date}::date, ${c.time}::time, ${c.id}::uuid) and ${sql.ref('postings.position')} > ${c.position}`;
