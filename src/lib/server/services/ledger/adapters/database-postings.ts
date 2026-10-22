import type { Queries } from '#lib/server/db/index.ts';
import { labels, noneOf, total, totalBefore } from '#lib/server/db/expressions.ts';
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
	postingColumns,
	postingsInFiles,
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
		const rows = await postingsInFiles(kysely)
			.select([
				'f.key as file',
				't.line',
				't.id',
				't.date',
				't.sortTime as time',
				't.description',
				'p.position',
				...postingColumns,
			])
			.where((e) =>
				e.and([
					listed(ledgerId, filter)(e),
					e('t.counted', '=', true),
					...(filter.account === null ? [] : [inAccount(filter.account)]),
					...(after === null ? [] : [e.or([before(after), atAfter(after)])]),
				]),
			)
			.orderBy(newestFirst)
			.orderBy('p.position')
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
				.selectFrom('postings as p')
				.select('p.account')
				.distinct()
				.where('p.ledgerId', '=', ledgerId)
				.orderBy('p.account')
				.execute(),
		).map((r) => r.map((a) => a.account)),
	);

export const listHoldings = (ledgerId: string): ResultAsync<Holding[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			kysely
				.with('balances', (q) =>
					q
						.selectFrom('deltas')
						.select([
							'deltas.account',
							'deltas.commodity',
							sql<string>`sum(${sql.ref('deltas.amount')})::text`.as('units'),
						])
						.where('deltas.ledgerId', '=', ledgerId)
						.where('deltas.accountType', 'in', BALANCE_TYPES)
						.groupBy(['deltas.account', 'deltas.commodity'])
						.having(sql<SqlBool>`sum(${sql.ref('deltas.amount')}) <> 0`),
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
				.with('entries', () =>
					postingsInFiles(kysely)
						.innerJoin(asserted(kysely, ledgerId).as('a'), (j) =>
							j.onRef('a.account', '=', 'p.account').onRef('a.commodity', '=', 'p.commodity'),
						)
						.select([
							'f.key as file',
							't.line',
							't.date',
							't.time',
							'p.position',
							'p.account',
							'p.commodity',
							'p.amount',
							'p.balance',
							noneOf('t.id', uncounted, 'uuid').as('counted'),
						])
						.where('p.ledgerId', '=', ledgerId),
				)
				.with('days', (q) =>
					q
						.selectFrom('deltas')
						.innerJoin(asserted(kysely, ledgerId).as('a'), (j) =>
							j
								.onRef('a.account', '=', 'deltas.account')
								.onRef('a.commodity', '=', 'deltas.commodity'),
						)
						.select(['deltas.account', 'deltas.commodity', 'deltas.date', 'deltas.amount as total'])
						.where('deltas.ledgerId', '=', ledgerId),
				)
				.with('openings', (q) =>
					q
						.selectFrom('days')
						.select([
							'days.account',
							'days.commodity',
							'days.date',
							totalBefore('days.total', ['days.account', 'days.commodity'], 'days.date').as(
								'opening',
							),
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
									total('e.amount', x.or([earlierInFile, earlierInOther])),
								).as('actual'),
								labels('e.file', 'e.line', unsure).as('unordered'),
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

/** The accounts and commodities that have a balance assertion. */
const asserted = (kysely: Queries, ledgerId: string) =>
	kysely
		.selectFrom('postings as p')
		.select(['p.account', 'p.commodity'])
		.distinct()
		.where('p.ledgerId', '=', ledgerId)
		.where('p.balance', 'is not', null);

const atAfter = (c: PostingCursor) =>
	sql<SqlBool>`(${sql.ref('t.date')}, ${sql.ref('t.sortTime')}, ${sql.ref('t.id')}) = (${c.date}::date, ${c.time}::time, ${c.id}::uuid) and ${sql.ref('p.position')} > ${c.position}`;
