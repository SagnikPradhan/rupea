import { literalLike } from '#lib/server/db/index.ts';
import { labels, total, totalBefore } from '#lib/server/db/expressions.ts';
import { readOnly } from '#lib/server/db/read-only.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SqlBool } from 'kysely';
import type { Amount } from '../domain/amounts';
import type { Holding } from '../domain/holdings';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { RupeaParseLocation, RupeaPosting } from '../domain/types';
import { multiply, toCost, toPrice, toQuantity } from './database-queries';
import type { Page, PageOptions } from './database-transactions';

/** Where a page of postings starts: just past this one, newest first. */
export type PostingCursor = { date: string; time: string; id: string; position: number };

export type ListedPosting = {
	transaction: string;
	position: number;
	location: RupeaParseLocation;
	date: Temporal.PlainDate;
	description: string;
	posting: RupeaPosting;
};

// `unordered` holds postings that could fall either side of the assertion.
export type BalanceCheck = {
	location: RupeaParseLocation;
	account: string;
	commodity: string;
	expected: Amount;
	actual: Amount;
	unordered: string[];
};

// Evidence is kept but not counted, so it has no postings to list. The account
// matches through postings_ledger_id_lower_account, and the cursor compares as
// one tuple, so a page reads on as one range of the order index.
export const listPostings = (
	ledgerId: string,
	{ filter, after, limit }: PageOptions<PostingCursor>,
): ResultAsync<Page<ListedPosting, PostingCursor>> =>
	readOnly(async (db) => {
		const rows = await db
			.selectFrom('postings as p')
			.innerJoin('transactions as t', 't.id', 'p.transactionId')
			.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
			.select([
				'f.key as file',
				't.line',
				't.id',
				't.date',
				't.sortTime as time',
				't.description',
				'p.position',
				'p.account',
				'p.amount',
				'p.commodity',
				'p.priceAmount',
				'p.priceCommodity',
				'p.priceKind',
				'p.costAmount',
				'p.costCommodity',
				'p.costDate',
				'p.balance',
			])
			.where((e) =>
				e.and([
					e('t.ledgerId', '=', ledgerId),
					e('t.date', '>=', filter.from.toString()),
					e('t.date', '<=', filter.to.toString()),
					e('t.counted', '=', true),
					...(filter.description === null
						? []
						: [e('t.description', 'ilike', `%${literalLike(filter.description)}%`)]),
					...(filter.account === null
						? []
						: [
								sql<SqlBool>`(lower(${e.ref('p.account')}) = lower(${filter.account}) or lower(${e.ref('p.account')}) like lower(${literalLike(filter.account)}) || ':%')`,
							]),
					...(after === null
						? []
						: [
								e(
									e.refTuple('t.date', 't.sortTime', 't.id'),
									'<=',
									e.tuple(after.date, after.time, after.id),
								),
								e.or([e('t.id', '<>', after.id), e('p.position', '>', after.position)]),
							]),
				]),
			)
			.orderBy('t.date', 'desc')
			.orderBy('t.sortTime', 'desc')
			.orderBy('t.id', 'desc')
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
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('postings as p')
				.select('p.account')
				.distinct()
				.where('p.ledgerId', '=', ledgerId)
				.orderBy('p.account')
				.execute(),
		).map((r) => r.map((a) => a.account)),
	);

export const listHoldings = (ledgerId: string): ResultAsync<Holding[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.with('balances', (q) =>
					q
						.selectFrom('deltas')
						.select([
							'deltas.account',
							'deltas.commodity',
							(e) => e.fn.sum<bigint>('deltas.amount').as('units'),
						])
						.where('deltas.ledgerId', '=', ledgerId)
						.where('deltas.accountType', 'in', BALANCE_TYPES)
						.groupBy(['deltas.account', 'deltas.commodity'])
						.having((e) => e(e.fn.sum('deltas.amount'), '<>', 0n)),
				)
				.with('costs', (qb) =>
					qb
						.selectFrom('lots')
						.select((e) => [
							'lots.account',
							'lots.commodity',
							e.fn
								.sum<bigint>(
									multiply(e.cast(e.ref('lots.remaining'), 'numeric'), e.ref('lots.costAmount')),
								)
								.as('costAmount'),
							e
								.case()
								.when(e(e.fn.count('lots.costCommodity').distinct(), '=', 1))
								.then(e.fn.min('lots.costCommodity'))
								.end()
								.as('costCommodity'),
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
				units: row.units as Amount,
				cost: toQuantity({ amount: row.costAmount, commodity: row.costCommodity }),
			})),
		),
	);

// An assertion is a point in time on its account: every counted posting before
// it, in any file. A file is a sequence, so its own postings that day are
// ordered by line; another file's are ordered only when both sides have a time.
export const listBalanceChecks = (ledgerId: string): ResultAsync<BalanceCheck[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.with('entries', () =>
					db
						.selectFrom('postings as p')
						.innerJoin('transactions as t', 't.id', 'p.transactionId')
						.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
						.innerJoin(
							(q) =>
								q
									.selectFrom('postings')
									.select(['postings.account', 'postings.commodity'])
									.distinct()
									.where('postings.ledgerId', '=', ledgerId)
									.where('postings.balance', 'is not', null)
									.as('a'),
							(j) =>
								j.onRef('a.account', '=', 'p.account').onRef('a.commodity', '=', 'p.commodity'),
						)
						.select((e) => [
							'f.key as file',
							't.line',
							't.date',
							't.time',
							't.counted',
							'p.position',
							'p.account',
							'p.commodity',
							'p.amount',
							'p.balance',
							totalBefore(
								e.ref('p.amount'),
								[e.ref('p.account'), e.ref('p.commodity')],
								e.ref('t.date'),
								e('t.counted', '=', true),
							).as('opening'),
						])
						.where('p.ledgerId', '=', ledgerId),
				)
				.with('checks', (q) =>
					q
						.selectFrom('entries as a')
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
									x.ref('a.opening'),
									'+',
									total(x.ref('e.amount'), x.or([earlierInFile, earlierInOther])),
								).as('actual'),
								labels(x.ref('e.file'), x.ref('e.line'), unsure).as('unordered'),
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
							'a.opening',
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
