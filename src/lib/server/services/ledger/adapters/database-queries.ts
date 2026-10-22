import { literalLike } from '#lib/server/db/index.ts';
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import type { Amount, Quantity } from '../domain/amounts';
import type { LotCost, Price, PriceKind } from '../domain/types';
import { postings, transactions as transactionTable } from './database-schema';
import type { Cursor, ListFilter } from './database-transactions';

// A missing time sorts as midnight, so every transaction has a place in the order.
export const timeKey = sql<string>`coalesce(${transactionTable.time}, '00:00')`;

export const NEWEST_FIRST = [desc(transactionTable.date), desc(timeKey), desc(transactionTable.id)];

export const listed = (ledgerId: string, filter: ListFilter) =>
	and(
		eq(transactionTable.ledgerId, ledgerId),
		gte(transactionTable.date, filter.from.toString()),
		lte(transactionTable.date, filter.to.toString()),
		filter.description === null
			? undefined
			: ilike(transactionTable.description, `%${literalLike(filter.description)}%`),
	);

/** A posting to an account or any account under it, whatever their case. */
export const inAccount = (a: string) =>
	sql`(lower(${postings.account}) = lower(${a}) or starts_with(lower(${postings.account}), lower(${a}) || ':'))`;

export const before = (c: Cursor) =>
	sql`(${transactionTable.date}, ${timeKey}, ${transactionTable.id}) < (${c.date}::date, ${c.time}::time, ${c.id}::uuid)`;

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
