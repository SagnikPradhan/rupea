import { literalLike } from '#lib/server/db/index.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { sql, type ExpressionBuilder, type SqlBool } from 'kysely';
import type { Amount, Quantity } from '../domain/amounts';
import type { LotCost, Price, PriceKind } from '../domain/types';
import type { Cursor, ListFilter } from './database-transactions';

// A missing time sorts as midnight, so every transaction has a place in the order.
export const timeKey = sql<string>`coalesce(${sql.ref('transactions.time')}, '00:00')`;

export const newestFirst = sql`${sql.ref('transactions.date')} desc, ${timeKey} desc, ${sql.ref('transactions.id')} desc`;

export const listed =
	(ledgerId: string, filter: ListFilter) => (eb: ExpressionBuilder<Tables, 'transactions'>) =>
		eb.and([
			eb('transactions.ledgerId', '=', ledgerId),
			eb('transactions.date', '>=', filter.from.toString()),
			eb('transactions.date', '<=', filter.to.toString()),
			...(filter.description === null
				? []
				: [eb('transactions.description', 'ilike', `%${literalLike(filter.description)}%`)]),
		]);

/** A posting to an account or any account under it, whatever their case. */
export const inAccount = (a: string) =>
	sql<SqlBool>`(lower(${sql.ref('postings.account')}) = lower(${a}) or starts_with(lower(${sql.ref('postings.account')}), lower(${a}) || ':'))`;

export const before = (c: Cursor) =>
	sql<SqlBool>`(${sql.ref('transactions.date')}, ${timeKey}, ${sql.ref('transactions.id')}) < (${c.date}::date, ${c.time}::time, ${c.id}::uuid)`;

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
