import type { Database } from '#lib/server/db/index.ts';
import { sql } from 'kysely';
import { AMOUNT_UNIT } from '../../domain/amounts';

/**
 * Each stored month that differs from the daily deltas it sums, as "account
 * commodity month: stored ≠ summed".
 */
export const drift = async (db: Database, ledgerId: string) => {
	const rows = await sql<{ key: string; stored: string | null; summed: string | null }>`
		with m as (
			select account_id, commodity, month, amount, inflow, outflow from monthly_deltas where ledger_id = ${ledgerId}
		), d as (
			select account_id, commodity, date_trunc('month', date)::date as month, sum(amount) as amount,
				sum(inflow) as inflow, sum(outflow) as outflow
			from daily_deltas where ledger_id = ${ledgerId}
			group by 1, 2, 3
		)
		select a.name || ' ' || commodity || ' ' || month as key, m.amount as stored, d.amount as summed
		from m full join d using (account_id, commodity, month)
		join accounts a on a.id = account_id
		where (m.amount, m.inflow, m.outflow) is distinct from (d.amount, d.inflow, d.outflow)
		order by key`.execute(db);

	return rows.rows.map((r) => `${r.key}: ${r.stored} ≠ ${r.summed}`);
};

/**
 * The ledger's stored months, as "account commodity month units", in that
 * order.
 */
export const months = async (db: Database, ledgerId: string) => {
	const rows = await db
		.selectFrom('monthlyDeltas as m')
		.innerJoin('accounts as a', 'a.id', 'm.accountId')
		.select(['a.name as account', 'm.commodity', 'm.month', 'm.amount'])
		.where('m.ledgerId', '=', ledgerId)
		.orderBy('a.name')
		.orderBy('m.commodity')
		.orderBy('m.month')
		.execute();

	return rows.map((r) => `${r.account} ${r.commodity} ${r.month} ${r.amount / AMOUNT_UNIT}`);
};

/**
 * Each stored day of costs that differs from the counted balance postings it
 * sums, as "account commodity cost_commodity date: stored ≠ summed".
 */
export const costDriftOf = async (db: Database, ledgerId: string) => {
	const rows = await sql<{ key: string; stored: string | null; summed: string | null }>`
		with c as (
			select account_id, commodity, cost_commodity, date, cost, inflow, outflow, postings
			from daily_costs where ledger_id = ${ledgerId}
		), p as (
			select account_id, commodity, coalesce(price_commodity, commodity) as cost_commodity, date,
				sum(cost) as cost, sum(greatest(cost, 0)) as inflow, sum(greatest(-cost, 0)) as outflow,
				count(*)::integer as postings
			from (
				select *, case price_kind
					when 'unit' then round(amount * price_amount / 10000000000)
					when 'total' then sign(amount) * price_amount
					else amount end as cost
				from postings
				where ledger_id = ${ledgerId} and counted and account_type in ('Assets', 'Liabilities')
			) x
			group by 1, 2, 3, 4
		)
		select a.name || ' ' || commodity || ' ' || cost_commodity || ' ' || date as key,
			c.cost as stored, p.cost as summed
		from c full join p using (account_id, commodity, cost_commodity, date)
		join accounts a on a.id = account_id
		where (c.cost, c.inflow, c.outflow, c.postings) is distinct from (p.cost, p.inflow, p.outflow, p.postings)
		order by key`.execute(db);

	return rows.rows.map((r) => `${r.key}: ${r.stored} ≠ ${r.summed}`);
};

/**
 * The ledger's stored days of costs, as "account commodity cost_commodity date
 * cost postings", in that order.
 */
export const costsOf = async (db: Database, ledgerId: string) => {
	const rows = await db
		.selectFrom('dailyCosts as c')
		.innerJoin('accounts as a', 'a.id', 'c.accountId')
		.select([
			'a.name as account',
			'c.commodity',
			'c.costCommodity',
			'c.date',
			'c.cost',
			'c.postings',
		])
		.where('c.ledgerId', '=', ledgerId)
		.orderBy('a.name')
		.orderBy('c.date')
		.orderBy('c.commodity')
		.orderBy('c.costCommodity')
		.execute();

	return rows.map(
		(r) =>
			`${r.account} ${r.commodity} ${r.costCommodity} ${r.date} ${r.cost / AMOUNT_UNIT} ${r.postings}`,
	);
};
