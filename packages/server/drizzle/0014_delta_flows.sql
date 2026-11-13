ALTER TABLE "monthly_deltas" ADD COLUMN "inflow" numeric(38, 0) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ADD COLUMN "outflow" numeric(38, 0) DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE OR REPLACE VIEW "daily_deltas" AS
	SELECT ledger_id, account_id, account_type, commodity, date, sum(amount) AS amount,
		sum(greatest(amount, 0)) AS inflow, sum(greatest(-amount, 0)) AS outflow
	FROM postings
	WHERE counted
	GROUP BY ledger_id, account_id, account_type, commodity, date;--> statement-breakpoint
UPDATE "monthly_deltas" m SET "inflow" = d.inflow, "outflow" = d.outflow
	FROM (
		SELECT ledger_id, account_id, commodity, date_trunc('month', date)::date AS month,
			sum(inflow) AS inflow, sum(outflow) AS outflow
		FROM daily_deltas
		GROUP BY 1, 2, 3, 4
	) d
	WHERE m.ledger_id = d.ledger_id AND m.account_id = d.account_id
		AND m.commodity = d.commodity AND m.month = d.month;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ADD CONSTRAINT "monthly_deltas_amount_is_inflow_less_outflow" CHECK ("monthly_deltas"."amount" = "monthly_deltas"."inflow" - "monthly_deltas"."outflow");
