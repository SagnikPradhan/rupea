import { sql, type Expression, type SqlBool } from 'kysely';
import { literalLike } from '#lib/server/db/index.ts';
import { AMOUNT_UNIT, type Amount, type Quantity } from '../domain/amounts';
import type { LotCost, Price, PriceKind } from '../domain/types';

/** An amount times a price per unit, rounded to a ten-billionth as the domain's multiply is. */
export const multiply = (a: Expression<unknown>, b: Expression<unknown>) =>
	sql<bigint>`round(${a} * ${b} / ${sql.lit(AMOUNT_UNIT)})`;

/** This account or any under it, ignoring case, so it reads through postings_ledger_id_lower_account; every account when there is none. */
export const underAccount = (c: Expression<string>, a: string | null) =>
	a
		? sql<SqlBool>`(lower(${c}) = lower(${a}) or lower(${c}) like lower(${literalLike(a)}) || ':%')`
		: sql<SqlBool>`true`;

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
