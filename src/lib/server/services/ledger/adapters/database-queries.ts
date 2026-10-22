import { literalLike, type Queries } from '#lib/server/db/index.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import { AMOUNT_UNIT, type Amount, type Quantity } from '../domain/amounts';
import type { LotCost, Price, PriceKind } from '../domain/types';
import type { Cursor, ListFilter } from './database-transactions';

/** The tables as the ledger queries alias them: postings `p`, transactions `t` and files `f`. */
type Aliased = Tables & {
	p: Tables['postings'];
	t: Tables['transactions'];
	f: Tables['ledgerFiles'];
};

/** Each posting with its transaction. */
export const postingsInTransactions = (kysely: Queries) =>
	kysely.selectFrom('postings as p').innerJoin('transactions as t', 't.id', 'p.transactionId');

/** Each posting with its transaction and file. */
export const postingsInFiles = (kysely: Queries) =>
	postingsInTransactions(kysely).innerJoin('ledgerFiles as f', 'f.id', 't.fileId');

export const postingColumns = [
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
] as const;

// A missing time sorts as midnight, so every transaction has a place in the order.
export const timeKey = sql<string>`coalesce(${sql.ref('t.time')}, '00:00')`;

export const newestFirst = sql`${sql.ref('t.date')} desc, ${timeKey} desc, ${sql.ref('t.id')} desc`;

export const listed =
	(ledgerId: string, filter: ListFilter) => (e: ExpressionBuilder<Aliased, 't'>) =>
		e.and([
			e('t.ledgerId', '=', ledgerId),
			e('t.date', '>=', filter.from.toString()),
			e('t.date', '<=', filter.to.toString()),
			...(filter.description === null
				? []
				: [e('t.description', 'ilike', `%${literalLike(filter.description)}%`)]),
		]);

/** An amount times a price per unit, rounded to a ten-billionth as the domain's multiply is. */
export const multiply = (a: Expression<unknown>, b: Expression<unknown>) =>
	sql<bigint>`round(${a} * ${b} / ${sql.lit(AMOUNT_UNIT)})`;

/** A posting to an account or any account under it, whatever their case. */
export const inAccount = (a: string) =>
	sql<SqlBool>`(lower(${sql.ref('p.account')}) = lower(${a}) or starts_with(lower(${sql.ref('p.account')}), lower(${a}) || ':'))`;

export const before = (c: Cursor) =>
	sql<SqlBool>`(${sql.ref('t.date')}, ${timeKey}, ${sql.ref('t.id')}) < (${c.date}::date, ${c.time}::time, ${c.id}::uuid)`;

type PriceColumns = {
	priceAmount: bigint | null;
	priceCommodity: string | null;
	priceKind: PriceKind | null;
};

export const toPrice = ({ priceAmount, priceCommodity, priceKind }: PriceColumns): Price | null =>
	priceAmount === null || priceCommodity === null || priceKind === null
		? null
		: {
				amount: priceAmount as Amount,
				commodity: priceCommodity,
				kind: priceKind,
			};

type CostColumns = {
	costAmount: bigint | null;
	costCommodity: string | null;
	costDate: string | null;
};

export const toCost = ({ costAmount, costCommodity, costDate }: CostColumns): LotCost | null =>
	costAmount === null || costCommodity === null
		? null
		: {
				amount: costAmount as Amount,
				commodity: costCommodity,
				date: costDate === null ? null : Temporal.PlainDate.from(costDate),
			};

type QuantityColumns = { amount: bigint | null; commodity: string | null };

export const toQuantity = ({ amount, commodity }: QuantityColumns): Quantity | null =>
	amount === null || commodity === null ? null : { amount: amount as Amount, commodity };
