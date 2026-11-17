import {
	atOrBefore,
	before,
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
import type { RupeaParseLocation, RupeaPosting } from '../domain/types';
import { BEGINNING } from '@rupea/shared/dates.ts';
import { deltasBetween } from './database-deltas';
import type { HoldingKey } from './database-files';
import {
	amongHoldings,
	ledgerOrder,
	listedIn,
	listingKey,
	newestFirst,
	toCost,
	toPrice,
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
	/**
	 * The transactions, as file:line, that could fall either side of the
	 * assertion.
	 */
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
			.innerJoin('accounts as a', 'a.id', 'p.accountId')
			.select([
				'f.key as file',
				't.line',
				't.id',
				't.date',
				't.sortTime as time',
				't.description',
				'p.position',
				'a.name as account',
				'p.amount',
				'p.commodity',
				'p.priceAmount',
				'p.priceCommodity',
				'p.priceKind',
				'p.costAmount',
				'p.costCommodity',
				'p.costDate',
				'p.balance',
				'p.comment',
			])
			.where('t.ledgerId', '=', ledgerId)
			.where(listedIn('t', filter))
			.where('t.counted', '=', true)
			.where((e) => underAccount(e.ref('a.name'), filter.account))
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
					comment: r.comment,
				},
			})),
			next: last
				? { date: last.date, time: last.time, id: last.id, position: last.position }
				: null,
		};
	});

type BalanceChecksOptions = { from: Temporal.PlainDate; holdings: HoldingKey[] | null };

/**
 * Stores what these holdings, or all when null, hold at their assertions from
 * from's month on, and the other files' transactions that day it cannot order.
 * An assertion depends only on its own account and commodity.
 */
export const saveBalanceChecks = (
	ledgerId: string,
	{ from, holdings }: BalanceChecksOptions,
): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const first = from.with({ day: 1 }).toString();

			await db
				.with('held', () =>
					db
						.selectFrom('postings as p')
						.select(['p.accountId', 'p.commodity'])
						.distinct()
						.where('p.ledgerId', '=', ledgerId)
						.where('p.balance', 'is not', null)
						.where('p.date', '>=', first)
						.where((e) => amongHoldings(e.ref('p.accountId'), e.ref('p.commodity'), holdings)),
				)
				.with('openings', (q) =>
					q
						.selectFrom('held as k')
						.leftJoin(
							deltasBetween(db, ledgerId, {
								from: Temporal.PlainDate.from(BEGINNING),
								after: Temporal.PlainDate.from(first),
								grain: 'month',
							}).as('m'),
							(j) =>
								j.onRef('m.accountId', '=', 'k.accountId').onRef('m.commodity', '=', 'k.commodity'),
						)
						.select((e) => ['k.accountId', 'k.commodity', total(e.ref('m.amount')).as('amount')])
						.groupBy(['k.accountId', 'k.commodity']),
				)
				.with('entries', (q) =>
					q
						.selectFrom('held as k')
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
									.where('p.accountId', '=', e.ref('k.accountId'))
									.where('p.commodity', '=', e.ref('k.commodity'))
									.where('p.date', '>=', first)
									.as('p'),
							(j) => j.onTrue(),
						)
						.selectAll('p')
						.select((e) => [
							'k.accountId',
							'k.commodity',
							totalBefore(
								e.ref('p.amount'),
								[e.ref('k.accountId'), e.ref('k.commodity')],
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
							j.onRef('o.accountId', '=', 'a.accountId').onRef('o.commodity', '=', 'a.commodity'),
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
									.where('p.accountId', '=', e.ref('a.accountId'))
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

/**
 * The assertions that do not hold, each only where its account's error differs
 * from the one before, or that cannot be ordered.
 */
export const listBalanceChecks = (ledgerId: string): ResultAsync<BalanceCheck[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.with('assertions', () =>
					db
						.selectFrom('postings as p')
						.innerJoin('transactions as t', 't.id', 'p.transactionId')
						.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
						.innerJoin('accounts as k', 'k.id', 'p.accountId')
						.select((e) => {
							const error = e(e.ref('p.actual'), '-', e.ref('p.balance'));
							const previous = sql<bigint>`lag(${error}, 1, 0) over (partition by p.account_id, p.commodity order by ${ledgerOrder('t', 'f')}, p.position)`;

							return [
								'f.key as file',
								't.line',
								'k.name as account',
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
