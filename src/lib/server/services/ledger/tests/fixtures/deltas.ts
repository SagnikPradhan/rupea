import type { Database } from '#lib/server/db/index.ts';
import { sql } from 'kysely';
import { AMOUNT_UNIT } from '../../domain/amounts';

/** Each stored month that differs from the daily deltas it sums, as "account commodity month: stored ≠ summed". */
export const drift = async (db: Database, ledgerId: string) => {
	const rows = await sql<{ key: string; stored: string | null; summed: string | null }>`
		with m as (
			select account_id, commodity, month, amount from monthly_deltas where ledger_id = ${ledgerId}
		), d as (
			select account_id, commodity, date_trunc('month', date)::date as month, sum(amount) as amount
			from daily_deltas where ledger_id = ${ledgerId}
			group by 1, 2, 3
		)
		select a.name || ' ' || commodity || ' ' || month as key, m.amount as stored, d.amount as summed
		from m full join d using (account_id, commodity, month)
		join accounts a on a.id = account_id
		where m.amount is distinct from d.amount
		order by key`.execute(db);

	return rows.rows.map((r) => `${r.key}: ${r.stored} ≠ ${r.summed}`);
};

/** The ledger's stored months, as "account commodity month units", in that order. */
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
