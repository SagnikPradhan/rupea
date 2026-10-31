CREATE TABLE "balance_years" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_type" "account_type" NOT NULL,
	"commodity" text NOT NULL,
	"year" integer NOT NULL,
	"balances" "bytea" NOT NULL,
	CONSTRAINT "balance_years_ledger_id_account_id_commodity_year" UNIQUE("ledger_id","account_id","commodity","year")
);
--> statement-breakpoint
CREATE TABLE "price_years" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"price_commodity" text NOT NULL,
	"year" integer NOT NULL,
	"amounts" "bytea" NOT NULL,
	CONSTRAINT "price_years_symbol_id_price_commodity_year" UNIQUE("symbol_id","price_commodity","year")
);
--> statement-breakpoint
ALTER TABLE "balance_years" ADD CONSTRAINT "balance_years_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_years" ADD CONSTRAINT "balance_years_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_years" ADD CONSTRAINT "price_years_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_years_account_id" ON "balance_years" USING btree ("account_id");--> statement-breakpoint
SELECT attach_updated_at();