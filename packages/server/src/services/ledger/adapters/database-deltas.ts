import type { Database } from '#lib/server/db/index.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { monthOf } from '#lib/server/db/expressions.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Span } from '@rupea/shared/dates.ts';
import { anyOf } from '#lib/server/db/expressions.ts';
import { sql } from 'kysely';
import type { HoldingKey } from './database-files';
import { amongHoldings } from './database-queries';

const CHECKED = { months: 12 };

const FOREVER = 'infinity';

type MonthlyDeltasOptions = { span: Span; holdings: HoldingKey[] };

/**
 * Rewrites these holdings' months from the one holding the span's start to the
 * one holding its end.
 */
export const saveMonthlyDeltas = (
	ledgerId: string,
	{ span, holdings }: MonthlyDeltasOptions,
): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const first = span.from.with({ day: 1 });
				const after = span.to.with({ day: 1 }).add({ months: 1 });

				await rewrite(tx, {
					ledgerId,
					first: first.toString(),
					after: after.toString(),
					holdings,
				});
			}),
		),
	);

/**
 * Rewrites the twelve months after the ledger's checked_through and moves it
 * on, back to the start after its last month. Returns the years they fall in,
 * or null for a ledger with no transactions.
 */
export const saveCheckedMonths = (
	ledgerId: string,
): ResultAsync<{ from: number; to: number } | null> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				const { checked, start, last } = await findChecked(tx, ledgerId);
				const end = start && Temporal.PlainDate.from(start).with({ day: 1 }).add(CHECKED);
				const first = checked && start ? start : '-infinity';
				const after = end && last && end.toString() <= last ? end : null;

				await rewrite(tx, {
					ledgerId,
					first,
					after: after?.toString() ?? 'infinity',
					holdings: null,
				});
				await tx
					.updateTable('ledgers')
					.set({ checkedThrough: after?.subtract({ days: 1 }).toString() ?? null })
					.where('id', '=', ledgerId)
					.execute();
				if (!start || !last) return null;

				const final = after ? after.subtract({ days: 1 }) : Temporal.PlainDate.from(last);
				return { from: Temporal.PlainDate.from(start).year, to: final.year };
			}),
		),
	);

/** Rewrites all a ledger's months. */
export const saveEveryMonth = (ledgerId: string): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(() =>
				rewrite(tx, { ledgerId, first: '-infinity', after: 'infinity', holdings: null }),
			),
		),
	);

type FirstMoveOptions = { accounts: string[]; to: Temporal.PlainDate };

/**
 * The first day any of these accounts moved, or null when none did by the month
 * holding to.
 */
export const findFirstDelta = (
	ledgerId: string,
	{ accounts, to }: FirstMoveOptions,
): ResultAsync<Temporal.PlainDate | null> =>
	withContext('db')((db) =>
		attempt(async () => {
			const first = await db
				.selectFrom('monthlyDeltas as m')
				.select((e) => e.fn.min('m.month').as('month'))
				.where('m.ledgerId', '=', ledgerId)
				.where('m.month', '<=', to.toString())
				.where((e) => anyOf(e.ref('m.accountId'), accounts, 'uuid'))
				.executeTakeFirst();
			if (!first?.month) return null;

			const after = Temporal.PlainDate.from(first.month).add({ months: 1 }).toString();
			const day = await db
				.selectFrom('dailyDeltas as d')
				.select((e) => e.fn.min('d.date').as('date'))
				.where('d.ledgerId', '=', ledgerId)
				.where('d.date', '>=', first.month)
				.where('d.date', '<', after)
				.where((e) => anyOf(e.ref('d.accountId'), accounts, 'uuid'))
				.executeTakeFirst();

			return day?.date ? Temporal.PlainDate.from(day.date) : null;
		}),
	);

type DeltasOptions = {
	from: Temporal.PlainDate;
	/** The day the moves stop before, or null to read on. */
	after: Temporal.PlainDate | null;
	grain: 'month' | 'day';
};

/**
 * What each account moved of each commodity, whatever its type, dated by the
 * day, or by the month's first day where the month is whole and its total can
 * be read.
 */
export const deltasBetween = (db: Database, ledgerId: string, o: DeltasOptions) => {
	const from = o.from.toString();
	const after = o.after?.toString() ?? FOREVER;
	const whole = o.grain === 'month' ? wholeMonths(o) : null;
	const days = (since: string, until: string) =>
		db
			.selectFrom('dailyDeltas as d')
			.select([
				'd.accountId',
				'd.accountType',
				'd.commodity',
				'd.date as day',
				'd.amount',
				'd.inflow',
				'd.outflow',
			])
			.where('d.ledgerId', '=', ledgerId)
			.where('d.date', '>=', since)
			.where('d.date', '<', until);

	return db
		.selectFrom('monthlyDeltas as m')
		.select([
			'm.accountId',
			'm.accountType',
			'm.commodity',
			'm.month as day',
			'm.amount',
			'm.inflow',
			'm.outflow',
		])
		.where('m.ledgerId', '=', ledgerId)
		.where('m.month', '>=', whole?.from ?? from)
		.where('m.month', '<', whole ? whole.after : from)
		.unionAll(days(from, whole?.from ?? after))
		.unionAll(days(whole?.after ?? from, whole ? after : from));
};

/**
 * What each posting moved, shaped as deltasBetween has it, for a read that adds
 * the days up itself and has no use for the view's daily sums.
 */
export const postedBetween = (db: Database, ledgerId: string, { from, after }: DeltasOptions) =>
	db
		.selectFrom('postings as p')
		.select((e) => [
			'p.accountId',
			'p.accountType',
			'p.commodity',
			'p.date as day',
			'p.amount',
			sql<bigint>`greatest(${e.ref('p.amount')}, 0)`.as('inflow'),
			sql<bigint>`greatest(-${e.ref('p.amount')}, 0)`.as('outflow'),
		])
		.where('p.ledgerId', '=', ledgerId)
		.where('p.counted', '=', true)
		.where('p.date', '>=', from.toString())
		.where('p.date', '<', after?.toString() ?? FOREVER);

/**
 * The months from the first to start on or after the start to the last to end
 * before the stop, or null when none is whole.
 */
const wholeMonths = ({ from, after }: DeltasOptions) => {
	const first = from.day === 1 ? from : from.with({ day: 1 }).add({ months: 1 });
	const end = after?.with({ day: 1 }) ?? null;

	return end === null || Temporal.PlainDate.compare(first, end) < 0
		? { from: first.toString(), after: end?.toString() ?? FOREVER }
		: null;
};

type RewriteOptions = {
	ledgerId: string;
	first: string;
	after: string;
	holdings: HoldingKey[] | null;
};

const rewrite = async (tx: Database, { ledgerId, first, after, holdings }: RewriteOptions) => {
	const month = monthOf(sql.ref<string>('d.date'));

	await tx
		.deleteFrom('monthlyDeltas')
		.where('ledgerId', '=', ledgerId)
		.where('month', '>=', first)
		.where('month', '<', after)
		.where((e) => amongHoldings(e.ref('accountId'), e.ref('commodity'), holdings))
		.execute();
	await tx
		.insertInto('monthlyDeltas')
		.columns([
			'ledgerId',
			'accountId',
			'accountType',
			'commodity',
			'month',
			'amount',
			'inflow',
			'outflow',
		])
		.expression(
			tx
				.selectFrom('dailyDeltas as d')
				.select((e) => [
					'd.ledgerId',
					'd.accountId',
					'd.accountType',
					'd.commodity',
					month.as('month'),
					e.fn.sum<bigint>('d.amount').as('amount'),
					e.fn.sum<bigint>('d.inflow').as('inflow'),
					e.fn.sum<bigint>('d.outflow').as('outflow'),
				])
				.where('d.ledgerId', '=', ledgerId)
				.where('d.date', '>=', first)
				.where('d.date', '<', after)
				.where((e) => amongHoldings(e.ref('d.accountId'), e.ref('d.commodity'), holdings))
				.groupBy(['d.ledgerId', 'd.accountId', 'd.accountType', 'd.commodity', month]),
		)
		.execute();
};

/**
 * The day after checked_through, or the ledger's first day when it is none, and
 * its last day.
 */
const findChecked = (tx: Database, ledgerId: string) =>
	tx
		.selectFrom('ledgers as l')
		.select((e) => [
			e('l.checkedThrough', 'is not', null).as('checked'),
			e.fn
				.coalesce(
					sql<string>`${e.ref('l.checkedThrough')} + 1`,
					e
						.selectFrom('transactions as t')
						.select((f) => f.fn.min('t.date').as('date'))
						.whereRef('t.ledgerId', '=', 'l.id'),
				)
				.as('start'),
			e
				.selectFrom('transactions as t')
				.select((f) => f.fn.max('t.date').as('date'))
				.whereRef('t.ledgerId', '=', 'l.id')
				.as('last'),
		])
		.where('l.id', '=', ledgerId)
		.executeTakeFirstOrThrow();
