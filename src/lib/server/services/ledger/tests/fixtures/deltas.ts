import type { Database } from '#lib/server/db/index.ts';
import { sql } from 'kysely';
import { AMOUNT_UNIT } from '../../domain/amounts';

/** Each stored month that differs from the daily deltas it sums, as "account commodity month: stored ≠ summed". */
export const drift = async (db: Database, ledgerId: string) => {
	const rows = await sql<{ key: string; stored: string | null; summed: string | null }>`
		with m as (
			select account, commodity, month, amount from monthly_deltas where ledger_id = ${ledgerId}
		), d as (
			select account, commodity, date_trunc('month', date)::date as month, sum(amount) as amount
			from daily_deltas where ledger_id = ${ledgerId}
			group by 1, 2, 3
		)
		select account || ' ' || commodity || ' ' || month as key, m.amount as stored, d.amount as summed
		from m full join d using (account, commodity, month)
		where m.amount is distinct from d.amount
		order by key`.execute(db);

	return rows.rows.map((r) => `${r.key}: ${r.stored} ≠ ${r.summed}`);
};

/** The ledger's stored months, as "account commodity month units", in that order. */
export const months = async (db: Database, ledgerId: string) => {
	const rows = await db
		.selectFrom('monthlyDeltas')
		.select(['account', 'commodity', 'month', 'amount'])
		.where('ledgerId', '=', ledgerId)
		.orderBy('account')
		.orderBy('commodity')
		.orderBy('month')
		.execute();

	return rows.map((r) => `${r.account} ${r.commodity} ${r.month} ${r.amount / AMOUNT_UNIT}`);
};
