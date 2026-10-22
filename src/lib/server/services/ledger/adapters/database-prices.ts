import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type RawBuilder } from 'kysely';
import { AMOUNT_UNIT, DEFAULT_COMMODITY, type Amount, type Quantity } from '../domain/amounts';
import { AccountType, Feed, PriceSource } from '../domain/types';

const UNIT = sql.lit(AMOUNT_UNIT);

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
	withContext('kysely')((kysely) =>
		attempt(() =>
			sql<LatestPriceRow>`
				with own as (${ownSymbols(ledgerId)})
				select c.commodity, p.amount::text as price_amount, p.currency as price_commodity
				from unnest(${commodities}::text[]) as c(commodity)
				join own o on o.symbol = c.commodity
				cross join lateral (${priceOn(sql`o.id`, sql`${day.toString()}::date`)}) p
			`.execute(kysely),
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
	withContext('kysely')((kysely) =>
		attempt(() =>
			sql<WorthRow>`
				with own as (${ownSymbols(ledgerId)}),
				deltas as (
					select p.account_type = ${AccountType.Assets} as asset, p.commodity, t.date, sum(p.amount) as amount
					from postings p
					join transactions t on t.id = p.transaction_id
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
					select x.asset, x.commodity, o.id as symbol_id,
						sum(x.amount) filter (where x.date < (select min(day) from days)) as opening
					from deltas x
					left join own o on o.symbol = x.commodity
					group by x.asset, x.commodity, o.id
				),
				balances as (
					select k.asset, k.commodity, k.symbol_id, d.day,
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
					left join lateral (${priceOn(sql`b.symbol_id`, sql`b.day`)}) p1 on b.commodity <> ${DEFAULT_COMMODITY}
					left join own o on o.symbol = p1.currency and p1.currency <> ${DEFAULT_COMMODITY}
					left join lateral (${priceOn(sql`o.id`, sql`b.day`)}) p2 on true
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
			`.execute(kysely),
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

/** The ledger's own symbols, so each commodity is looked up once rather than once a day. */
const ownSymbols = (ledgerId: string) => sql`
	select id, symbol
	from symbols
	where feed = ${Feed.Ledger} and ledger_id = ${ledgerId}
`;

/** The latest price of a symbol on or before a day, where a P line beats an at-price on the same day. */
const priceOn = (symbolId: RawBuilder<unknown>, day: RawBuilder<unknown>) => sql`
	select price_amount as amount, price_commodity as currency
	from prices
	where symbol_id = ${symbolId} and date <= ${day}
	order by date desc, source = ${PriceSource.Line} desc, line desc
	limit 1
`;
