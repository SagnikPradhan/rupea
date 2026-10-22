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

type BalanceRow = {
	file: string;
	line: number;
	account: string;
	commodity: string;
	expected: string;
	actual: string;
	unordered: string[];
};

// An assertion is a point in time on its account: every counted posting before
// it, in any file. A file is a sequence, so its own postings that day are
// ordered by line; another file's are ordered only when both sides have a time.
export const listBalanceChecks = (
	ledgerId: string,
	uncounted: string[],
): ResultAsync<BalanceCheck[]> =>
	withContext('kysely')((kysely) =>
		attempt(() =>
			sql<BalanceRow>`
				with asserted as (
					select distinct p.account, p.commodity
					from postings p
					where p.ledger_id = ${ledgerId} and p.balance is not null
				),
				entries as (
					select f.key as file, t.line, t.date, t.time, p.position, p.account, p.commodity, p.amount, p.balance,
						t.id <> all(${uncounted}::uuid[]) as counted
					from postings p
					join transactions t on t.id = p.transaction_id
					join ledger_files f on f.id = t.file_id
					where p.ledger_id = ${ledgerId} and (p.account, p.commodity) in (select account, commodity from asserted)
				),
				days as (
					select account, commodity, date, sum(case when counted then amount else 0 end) as total
					from entries
					group by account, commodity, date
				),
				openings as (
					select account, commodity, date, sum(total) over (partition by account, commodity order by date) - total as opening
					from days
				),
				checks as (
					select a.file, a.line, a.account, a.commodity, a.balance,
						o.opening + coalesce(sum(e.amount) filter (where
							(e.file = a.file and (e.line < a.line or (e.line = a.line and e.position <= a.position)))
							or (e.file != a.file and e.time < a.time)
						), 0) as actual,
						coalesce(array_agg(distinct e.file || ':' || e.line) filter (where
							e.file != a.file and (e.time is null or a.time is null or e.time = a.time)
						), '{}') as unordered
					from entries a
					join openings o on o.account = a.account and o.commodity = a.commodity and o.date = a.date
					left join entries e on e.account = a.account and e.commodity = a.commodity and e.date = a.date and e.counted
					where a.balance is not null
					group by a.file, a.line, a.position, a.account, a.commodity, a.balance, o.opening
				)
				select file, line, account, commodity, balance::text as expected, actual::text as actual, unordered
				from checks
				where balance != actual or cardinality(unordered) > 0
				order by file, line
			`.execute(kysely),
		).map((r) =>
			r.rows.map((c) => ({
				location: { file: c.file, line: c.line },
				account: c.account,
				commodity: c.commodity,
				expected: BigInt(c.expected) as Amount,
				actual: BigInt(c.actual) as Amount,
				unordered: c.unordered,
			})),
		),
	);

const atAfter = (c: PostingCursor) =>
	sql<SqlBool>`(${sql.ref('transactions.date')}, ${timeKey}, ${sql.ref('transactions.id')}) = (${c.date}::date, ${c.time}::time, ${c.id}::uuid) and ${sql.ref('postings.position')} > ${c.position}`;
