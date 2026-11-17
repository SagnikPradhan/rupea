CREATE TABLE "daily_costs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"commodity" text NOT NULL,
	"cost_commodity" text NOT NULL,
	"date" date NOT NULL,
	"cost" numeric(38, 0) NOT NULL,
	"inflow" numeric(38, 0) NOT NULL,
	"outflow" numeric(38, 0) NOT NULL,
	"postings" integer NOT NULL,
	CONSTRAINT "daily_costs_ledger_id_account_id_date_commodity_cost_commodity" UNIQUE("ledger_id","account_id","date","commodity","cost_commodity"),
	CONSTRAINT "daily_costs_cost_is_inflow_less_outflow" CHECK ("daily_costs"."cost" = "daily_costs"."inflow" - "daily_costs"."outflow")
);
--> statement-breakpoint
ALTER TABLE "daily_costs" ADD CONSTRAINT "daily_costs_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_costs" ADD CONSTRAINT "daily_costs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "daily_costs" ("ledger_id", "account_id", "commodity", "cost_commodity", "date", "cost", "inflow", "outflow", "postings")
	SELECT ledger_id, account_id, commodity, coalesce(price_commodity, commodity), date, sum(cost),
		sum(greatest(cost, 0)), sum(greatest(-cost, 0)), count(*)
	FROM (
		SELECT *, CASE price_kind
			WHEN 'unit' THEN round(amount * price_amount / 10000000000)
			WHEN 'total' THEN sign(amount) * price_amount
			ELSE amount
		END AS cost
		FROM postings
		WHERE counted AND account_type IN ('Assets', 'Liabilities')
	) p
	GROUP BY ledger_id, account_id, commodity, coalesce(price_commodity, commodity), date;--> statement-breakpoint
SELECT attach_updated_at();
