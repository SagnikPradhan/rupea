import { readOnly } from '#lib/server/db/read-only.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { AMOUNT_UNIT, type Amount } from '../domain/amounts';
import type { Holding } from '../domain/holdings';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { RupeeParseLocation, RupeePosting } from '../domain/types';
import {
	ledgerFiles,
	lots as lotTable,
	postings,
	transactions as transactionTable,
} from './database-schema';
import {
	before,
	inAccount,
	listed,
	NEWEST_FIRST,
	timeKey,
	toCost,
	toPrice,
	toQuantity,
	type Page,
	type PageOptions,
} from './database-transactions';

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
	readOnly(async (db) => {
		const rows = await db
			.select({
				file: ledgerFiles.key,
				line: transactionTable.line,
				id: transactionTable.id,
				date: transactionTable.date,
				time: sql<string>`${timeKey}::text`,
				description: transactionTable.description,
				position: postings.position,
				account: postings.account,
				amount: postings.amount,
				commodity: postings.commodity,
				priceAmount: postings.priceAmount,
				priceCommodity: postings.priceCommodity,
				priceKind: postings.priceKind,
				costAmount: postings.costAmount,
				costCommodity: postings.costCommodity,
				costDate: postings.costDate,
				balance: postings.balance,
			})
			.from(postings)
			.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
			.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
			.where(
				and(
					listed(ledgerId, filter),
					eq(transactionTable.counted, true),
					filter.account === null ? undefined : inAccount(filter.account),
					after === null ? undefined : or(before(after), atAfter(after)),
				),
			)
			.orderBy(...NEWEST_FIRST, asc(postings.position))
			.limit(limit);

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
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectDistinct({ account: postings.account })
				.from(postings)
				.where(eq(postings.ledgerId, ledgerId))
				.orderBy(asc(postings.account))
				.then((r) => r.map((a) => a.account)),
		),
	);

export const listHoldings = (ledgerId: string): ResultAsync<Holding[]> =>
	withContext('db')((db) => {
		const balances = db
			.select({
				account: postings.account,
				commodity: postings.commodity,
				units: sql<string>`sum(${postings.amount})::text`.as('units'),
			})
			.from(postings)
			.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
			.where(
				and(
					eq(postings.ledgerId, ledgerId),
					inArray(postings.accountType, BALANCE_TYPES),
					eq(transactionTable.counted, true),
				),
			)
			.groupBy(postings.account, postings.commodity)
			.having(sql`sum(${postings.amount}) <> 0`)
			.as('balances');
		const costs = db
			.select({
				account: lotTable.account,
				commodity: lotTable.commodity,
				costAmount:
					sql<string>`sum(round(${lotTable.remaining}::numeric * ${lotTable.costAmount} / ${sql.raw(AMOUNT_UNIT.toString())}))::text`.as(
						'cost_amount',
					),
				costCommodity: sql<
					string | null
				>`case when count(distinct ${lotTable.costCommodity}) = 1 then min(${lotTable.costCommodity}) end`.as(
					'cost_commodity',
				),
			})
			.from(lotTable)
			.where(and(eq(lotTable.ledgerId, ledgerId), ne(lotTable.remaining, 0n)))
			.groupBy(lotTable.account, lotTable.commodity)
			.as('costs');

		return attempt(() =>
			db
				.select({
					account: balances.account,
					commodity: balances.commodity,
					units: balances.units,
					costAmount: costs.costAmount,
					costCommodity: costs.costCommodity,
				})
				.from(balances)
				.leftJoin(
					costs,
					and(eq(costs.account, balances.account), eq(costs.commodity, balances.commodity)),
				)
				.orderBy(asc(balances.account), asc(balances.commodity)),
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
		);
	});

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
	withContext('db')((db) =>
		attempt(() =>
			db.execute<BalanceRow>(sql`
				with asserted as (
					select distinct p.account, p.commodity
					from ${postings} p
					where p.ledger_id = ${ledgerId} and p.balance is not null
				),
				entries as (
					select f.key as file, t.line, t.date, t.time, p.position, p.account, p.commodity, p.amount, p.balance,
						t.id <> all(${sql.param(uncounted)}::uuid[]) as counted
					from ${postings} p
					join ${transactionTable} t on t.id = p.transaction_id
					join ${ledgerFiles} f on f.id = t.file_id
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
			`),
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
	sql`(${transactionTable.date}, ${timeKey}, ${transactionTable.id}) = (${c.date}::date, ${c.time}::time, ${c.id}::uuid) and ${postings.position} > ${c.position}`;
