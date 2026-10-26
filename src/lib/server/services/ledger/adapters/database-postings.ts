import {
	atOrBefore,
	before,
	containing,
	distinctOf,
	labels,
	total,
	totalBefore,
} from '#lib/server/db/expressions.ts';
import { readOnly } from '#lib/server/db/read-only.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SqlBool } from 'kysely';
import type { Amount } from '../domain/amounts';
import type { Holding } from '../domain/holdings';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { RupeaParseLocation, RupeaPosting } from '../domain/types';
import {
	ledgerOrder,
	listingKey,
	multiply,
	newestFirst,
	toCost,
	toPrice,
	toQuantity,
	underAccount,
} from './database-queries';
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

export type BalanceCheck = {
	location: RupeaParseLocation;
	account: string;
	commodity: string;
	expected: Amount;
	actual: Amount;
	/** The transactions, as file:line, that could fall either side of the assertion. */
	unordered: string[];
};

// Evidence is kept but not counted, so it has no postings to list. The cursor
// reads on as one range of the order index; that range can't hold p.position,
// so a second tuple, with position negated, breaks ties inside a transaction.
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
			.where('t.ledgerId', '=', ledgerId)
			.where('t.date', '>=', filter.from.toString())
			.where('t.date', '<=', filter.to.toString())
			.where('t.counted', '=', true)
			.where((e) => containing(e.ref('t.description'), filter.description))
			.where((e) => underAccount(e.ref('p.account'), filter.account))
			.where(() => atOrBefore(listingKey('t'), after && [after.date, after.time, after.id]))
			.where((e) =>
				before(
					listingKey('t', e.neg(e.ref('p.position'))),
					after && [after.date, after.time, after.id, -after.position],
				),
			)
			.orderBy(newestFirst('t'))
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

export const listHoldings = (ledgerId: string): ResultAsync<Holding[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.with('balances', (q) =>
					q
						.selectFrom('monthlyDeltas')
						.select([
							'monthlyDeltas.account',
							'monthlyDeltas.commodity',
							(e) => e.fn.sum<bigint>('monthlyDeltas.amount').as('units'),
						])
						.where('monthlyDeltas.ledgerId', '=', ledgerId)
						.where('monthlyDeltas.accountType', 'in', BALANCE_TYPES)
						.groupBy(['monthlyDeltas.account', 'monthlyDeltas.commodity'])
						.having((e) => e(e.fn.sum('monthlyDeltas.amount'), '<>', 0n)),
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

/** Stores what each account holds at its assertions from from's month on, and the other files' transactions that day it cannot order. */
export const saveBalanceChecks = (ledgerId: string, from: Temporal.PlainDate): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const first = from.with({ day: 1 }).toString();

			await db
				.with('accounts', () =>
					db
						.selectFrom('postings as p')
						.select(['p.account', 'p.commodity'])
						.distinct()
						.where('p.ledgerId', '=', ledgerId)
						.where('p.balance', 'is not', null)
						.where('p.date', '>=', first),
				)
				.with('openings', (q) =>
					q
						.selectFrom('accounts as k')
						.leftJoin('monthlyDeltas as m', (j) =>
							j
								.onRef('m.account', '=', 'k.account')
								.onRef('m.commodity', '=', 'k.commodity')
								.on('m.ledgerId', '=', ledgerId)
								.on('m.month', '<', first),
						)
						.select((e) => ['k.account', 'k.commodity', total(e.ref('m.amount')).as('amount')])
						.groupBy(['k.account', 'k.commodity']),
				)
				.with('entries', (q) =>
					q
						.selectFrom('accounts as k')
						.innerJoinLateral(
							(e) =>
								db
									.selectFrom('postings as p')
									.select([
										'p.id',
										'p.transactionId',
										'p.date',
										'p.position',
										'p.balance',
										'p.amount',
										'p.counted',
									])
									.where('p.ledgerId', '=', ledgerId)
									.where('p.account', '=', e.ref('k.account'))
									.where('p.commodity', '=', e.ref('k.commodity'))
									.where('p.date', '>=', first)
									.as('p'),
							(j) => j.onTrue(),
						)
						.selectAll('p')
						.select((e) => [
							'k.account',
							'k.commodity',
							totalBefore(
								e.ref('p.amount'),
								[e.ref('k.account'), e.ref('k.commodity')],
								e.ref('p.date'),
								e('p.counted', '=', true),
							).as('before'),
						]),
				)
				.with('checks', (q) =>
					q
						.selectFrom('entries as a')
						.innerJoin('transactions as t', 't.id', 'a.transactionId')
						.innerJoin('openings as o', (j) =>
							j.onRef('o.account', '=', 'a.account').onRef('o.commodity', '=', 'a.commodity'),
						)
						.leftJoinLateral(
							(e) =>
								db
									.selectFrom('postings as p')
									.innerJoin('transactions as s', 's.id', 'p.transactionId')
									.select([
										's.id',
										's.fileId as file',
										's.line',
										's.time',
										'p.position',
										'p.amount',
									])
									.where('p.ledgerId', '=', ledgerId)
									.where('p.account', '=', e.ref('a.account'))
									.where('p.commodity', '=', e.ref('a.commodity'))
									.where('p.date', '=', e.ref('a.date'))
									.where('p.counted', '=', true)
									.as('d'),
							(j) => j.onTrue(),
						)
						.select((e) => {
							const sameFile = e('d.file', '=', e.ref('t.fileId'));
							const otherFile = e('d.file', '!=', e.ref('t.fileId'));
							const earlierInFile = e.and([
								sameFile,
								e.or([
									e('d.line', '<', e.ref('t.line')),
									e.and([
										e('d.line', '=', e.ref('t.line')),
										e('d.position', '<=', e.ref('a.position')),
									]),
								]),
							]);
							const earlierInOther = e.and([otherFile, e('d.time', '<', e.ref('t.time'))]);
							const unsure = e.and([
								otherFile,
								e.or([
									e('d.time', 'is', null),
									e('t.time', 'is', null),
									e('d.time', '=', e.ref('t.time')),
								]),
							]);

							return [
								'a.id',
								e(
									e(e.ref('o.amount'), '+', e.ref('a.before')),
									'+',
									total(e.ref('d.amount'), e.or([earlierInFile, earlierInOther])),
								).as('actual'),
								distinctOf(e.ref('d.id'), unsure).as('unordered'),
							];
						})
						.where('a.balance', 'is not', null)
						.groupBy(['a.id', 'o.amount', 'a.before']),
				)
				.updateTable('postings')
				.from('checks as c')
				.set((e) => ({ actual: e.ref('c.actual'), unordered: e.ref('c.unordered') }))
				.whereRef('postings.id', '=', 'c.id')
				.where((e) =>
					e.or([
						e('postings.actual', 'is distinct from', e.ref('c.actual')),
						e('postings.unordered', 'is distinct from', e.ref('c.unordered')),
					]),
				)
				.execute();
		}),
	);

/** The assertions that do not hold, each only where its account's error differs from the one before, or that cannot be ordered. */
export const listBalanceChecks = (ledgerId: string): ResultAsync<BalanceCheck[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.with('assertions', () =>
					db
						.selectFrom('postings as p')
						.innerJoin('transactions as t', 't.id', 'p.transactionId')
						.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
						.select((e) => {
							const error = e(e.ref('p.actual'), '-', e.ref('p.balance'));
							const previous = sql<bigint>`lag(${error}, 1, 0) over (partition by p.account, p.commodity order by ${ledgerOrder('t', 'f')}, p.position)`;

							return [
								'f.key as file',
								't.line',
								'p.account',
								'p.commodity',
								'p.balance',
								'p.actual',
								'p.unordered',
								error.as('error'),
								previous.as('previous'),
							];
						})
						.where('p.ledgerId', '=', ledgerId)
						.where('p.balance', 'is not', null),
				)
				.selectFrom('assertions as a')
				.innerJoinLateral(
					(e) =>
						db
							.selectFrom('transactions as t')
							.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
							.select((f) => labels(f.ref('f.key'), f.ref('t.line')).as('labels'))
							.where((f) => sql<SqlBool>`${f.ref('t.id')} = any(${e.ref('a.unordered')})`)
							.as('u'),
					(j) => j.onTrue(),
				)
				.select([
					'a.file',
					'a.line',
					'a.account',
					'a.commodity',
					'a.balance as expected',
					'a.actual',
					'u.labels as unordered',
				])
				.where((e) =>
					e.or([
						e(e.fn('cardinality', ['a.unordered']), '>', 0),
						e.and([e('a.error', '!=', 0n), e('a.error', 'is distinct from', e.ref('a.previous'))]),
					]),
				)
				.orderBy('a.file')
				.orderBy('a.line')
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
