import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type SQL } from 'drizzle-orm';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import { AccountType, PriceSource } from '../domain/types';
import {
	postings,
	prices as priceTable,
	transactions as transactionTable,
} from './database-schema';

const UNIT = sql.raw(AMOUNT_UNIT.toString());

/** What balance accounts were worth in rupees at the end of one day, and how many commodities had no price. */
export type Worth = {
	day: Temporal.PlainDate;
	assets: Amount;
	liabilities: Amount;
	worth: Amount;
	unpriced: number;
};

type LatestPriceRow = { commodity: string; priceAmount: string; priceCommodity: string };

export const findLatestPrices = (
	ledgerId: string,
	commodities: string[],
	day: Temporal.PlainDate,
): ResultAsync<Record<string, Quantity>> =>
	withContext('db')((db) =>
		attempt(() =>
			db.execute<LatestPriceRow>(sql`
				select c.commodity, p.amount::text as "priceAmount", p.currency as "priceCommodity"
				from unnest(${sql.param(commodities)}::text[]) as c(commodity)
				cross join lateral (${priceOn(ledgerId, sql`c.commodity`, sql`${day.toString()}::date`)}) p
			`),
		).map((result) =>
			Object.fromEntries(
				result.rows.map((row) => [
					row.commodity,
					{ amount: BigInt(row.priceAmount) as Amount, commodity: row.priceCommodity },
				]),
			),
		),
	);

type WorthRow = {
	day: string;
	assets: string;
	liabilities: string;
	worth: string;
	unpriced: number;
};

/**
 * Each day values its balances at the latest price on or before it, reaching rupees in at most
 * two prices and rounding each step as multiply does. The first day is the later of from and the
 * ledger's first counted transaction.
 */
export const listWorth = (
	ledgerId: string,
	from: Temporal.PlainDate,
	to: Temporal.PlainDate,
): ResultAsync<Worth[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db.execute<WorthRow>(sql`
				with deltas as (
					select p.account_type = ${AccountType.Assets} as asset, p.commodity, t.date, sum(p.amount) as amount
					from ${postings} p
					join ${transactionTable} t on t.id = p.transaction_id
					where p.ledger_id = ${ledgerId} and p.account_type in (${AccountType.Assets}, ${AccountType.Liabilities})
						and t.date <= ${to.toString()} and t.counted
					group by 1, 2, 3
				),
				days as (
					select d::date as day
					from (select min(date) as first from deltas) f,
						generate_series(greatest(${from.toString()}::date, f.first), ${to.toString()}::date, interval '1 day') d
					where f.first is not null
				),
				keys as (
					select asset, commodity, sum(amount) filter (where date < (select min(day) from days)) as opening
					from deltas
					group by asset, commodity
				),
				balances as (
					select k.asset, k.commodity, d.day,
						coalesce(k.opening, 0) + sum(coalesce(x.amount, 0)) over (partition by k.asset, k.commodity order by d.day) as units
					from keys k
					cross join days d
					left join deltas x on x.asset = k.asset and x.commodity = k.commodity and x.date = d.day
				),
				valued as (
					select b.day, b.asset,
						case
							when b.commodity = ${DEFAULT_COMMODITY} then b.units
							when p1.currency = ${DEFAULT_COMMODITY} then round(b.units * p1.amount / ${UNIT})
							when p2.currency = ${DEFAULT_COMMODITY} then round(b.units * round(p1.amount * p2.amount / ${UNIT}) / ${UNIT})
						end as value
					from balances b
					left join lateral (${priceOn(ledgerId, sql`b.commodity`, sql`b.day`)}) p1 on b.commodity <> ${DEFAULT_COMMODITY}
					left join lateral (${priceOn(ledgerId, sql`p1.currency`, sql`b.day`)}) p2 on p1.currency <> ${DEFAULT_COMMODITY}
					where b.units <> 0
				)
				select d.day::text as day,
					coalesce(sum(v.value) filter (where v.asset), 0)::text as assets,
					coalesce(-sum(v.value) filter (where not v.asset), 0)::text as liabilities,
					coalesce(sum(v.value), 0)::text as worth,
					count(v.day) filter (where v.value is null)::int as unpriced
				from days d
				left join valued v on v.day = d.day
				group by d.day
				order by d.day
			`),
		).map((r) =>
			r.rows.map((w) => ({
				day: Temporal.PlainDate.from(w.day),
				assets: BigInt(w.assets) as Amount,
				liabilities: BigInt(w.liabilities) as Amount,
				worth: BigInt(w.worth) as Amount,
				unpriced: w.unpriced,
			})),
		),
	);

/** The latest price of a commodity on or before a day, where a P line beats an at-price on the same day. */
const priceOn = (ledgerId: string, commodity: SQL, day: SQL) => sql`
	select price_amount as amount, price_commodity as currency
	from ${priceTable}
	where ledger_id = ${ledgerId} and commodity = ${commodity} and date <= ${day}
	order by date desc, source = ${PriceSource.Line} desc, line desc
	limit 1
`;
