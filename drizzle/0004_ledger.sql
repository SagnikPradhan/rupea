CREATE TYPE "public"."account_type" AS ENUM('Assets', 'Liabilities', 'Income', 'Expenses', 'Equity');--> statement-breakpoint
CREATE TYPE "public"."disposal_kind" AS ENUM('sale', 'transfer', 'gift', 'cover');--> statement-breakpoint
CREATE TYPE "public"."feed" AS ENUM('ledger', 'mfapi', 'yahoo');--> statement-breakpoint
CREATE TYPE "public"."lot_origin" AS ENUM('buy', 'transfer', 'short', 'unpriced');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('unit', 'total');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('line', 'posting', 'mfapi', 'yahoo');--> statement-breakpoint
CREATE TABLE "disposals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"lot_id" uuid,
	"posting_id" uuid NOT NULL,
	"commodity" text NOT NULL,
	"kind" "disposal_kind" NOT NULL,
	"units" numeric(38, 0) NOT NULL,
	"price_amount" numeric(38, 0),
	"price_commodity" text
);
--> statement-breakpoint
CREATE TABLE "ledger_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"key" text NOT NULL,
	"version" text,
	CONSTRAINT "ledger_files_ledger_id_key" UNIQUE("ledger_id","key")
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"checked_through" date,
	CONSTRAINT "ledgers_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"source_id" uuid,
	"account" text NOT NULL,
	"commodity" text NOT NULL,
	"origin" "lot_origin" NOT NULL,
	"date" date NOT NULL,
	"units" numeric(38, 0) NOT NULL,
	"remaining" numeric(38, 0) NOT NULL,
	"cost_amount" numeric(38, 0) NOT NULL,
	"cost_commodity" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	CONSTRAINT "memberships_user_id_ledger_id" UNIQUE("user_id","ledger_id")
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"file_id" uuid,
	"transaction_id" uuid,
	"posting_id" uuid,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "metadata_one_owner" CHECK (num_nonnulls("metadata"."file_id", "metadata"."transaction_id", "metadata"."posting_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "monthly_deltas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"commodity" text NOT NULL,
	"month" date NOT NULL,
	"amount" numeric(38, 0) NOT NULL,
	CONSTRAINT "monthly_deltas_ledger_id_account_commodity_month" UNIQUE("ledger_id","account","commodity","month")
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"date" date NOT NULL,
	"counted" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"account" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"amount" numeric(38, 0) NOT NULL,
	"commodity" text NOT NULL,
	"price_amount" numeric(38, 0),
	"price_commodity" text,
	"price_kind" "price_kind",
	"cost_amount" numeric(38, 0),
	"cost_commodity" text,
	"cost_date" date,
	"balance" numeric(38, 0),
	"actual" numeric(38, 0),
	"unordered" uuid[]
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"file_id" uuid,
	"line" integer,
	"date" date NOT NULL,
	"price_amount" numeric(38, 0) NOT NULL,
	"price_commodity" text NOT NULL,
	"source" "price_source" NOT NULL,
	CONSTRAINT "prices_read_from_files" CHECK (("prices"."source" in ('line', 'posting')) = ("prices"."file_id" is not null and "prices"."line" is not null))
);
--> statement-breakpoint
CREATE TABLE "symbol_fetches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone,
	"failing_since" timestamp with time zone,
	"error" jsonb,
	CONSTRAINT "symbol_fetches_symbol_id_unique" UNIQUE("symbol_id")
);
--> statement-breakpoint
CREATE TABLE "symbol_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"since" date,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feed" "feed" NOT NULL,
	"symbol" text NOT NULL,
	"ledger_id" uuid,
	CONSTRAINT "symbols_feed_ledger_id_symbol" UNIQUE NULLS NOT DISTINCT("feed","ledger_id","symbol"),
	CONSTRAINT "symbols_ledger_owns_its_own" CHECK (("symbols"."feed" = 'ledger') = ("symbols"."ledger_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"date" date NOT NULL,
	"time" time,
	"sort_time" time GENERATED ALWAYS AS (coalesce("time", '00:00')) STORED NOT NULL,
	"description" text NOT NULL,
	"embedding" vector(384),
	"embedding_model" text,
	"counted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_files" ADD CONSTRAINT "ledger_files_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_source_id_lots_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ADD CONSTRAINT "monthly_deltas_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_fetches" ADD CONSTRAINT "symbol_fetches_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_links" ADD CONSTRAINT "symbol_links_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_links" ADD CONSTRAINT "symbol_links_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_links" ADD CONSTRAINT "symbol_links_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disposals_lot_id" ON "disposals" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "disposals_posting_id" ON "disposals" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "disposals_ledger_id_commodity" ON "disposals" USING btree ("ledger_id","commodity");--> statement-breakpoint
CREATE INDEX "disposals_ledger_id_unmatched" ON "disposals" USING btree ("ledger_id") WHERE "disposals"."lot_id" IS NULL;--> statement-breakpoint
CREATE INDEX "ledgers_owner_id" ON "ledgers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lots_ledger_id_commodity_account" ON "lots" USING btree ("ledger_id","commodity","account");--> statement-breakpoint
CREATE INDEX "lots_posting_id" ON "lots" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "lots_source_id" ON "lots" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "metadata_file_id" ON "metadata" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "metadata_transaction_id" ON "metadata" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "metadata_posting_id" ON "metadata" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "metadata_ledger_id_key_value" ON "metadata" USING btree ("ledger_id","key","value");--> statement-breakpoint
CREATE INDEX "postings_transaction_id" ON "postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_account_amount" ON "postings" USING btree ("ledger_id","account","commodity","amount");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_account_date" ON "postings" USING btree ("ledger_id","account","commodity","date");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_commodity" ON "postings" USING btree ("ledger_id","commodity");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_lower_account" ON "postings" USING btree ("ledger_id",lower("account") text_pattern_ops);--> statement-breakpoint
CREATE INDEX "postings_ledger_id_balance" ON "postings" USING btree ("ledger_id","account","commodity") WHERE "postings"."balance" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prices_file_id" ON "prices" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "prices_symbol_id_date" ON "prices" USING btree ("symbol_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_symbol_id_date_quoted" ON "prices" USING btree ("symbol_id","date") WHERE "prices"."file_id" is null;--> statement-breakpoint
CREATE INDEX "symbol_links_ledger_id_alias" ON "symbol_links" USING btree ("ledger_id","alias");--> statement-breakpoint
CREATE INDEX "symbol_links_file_id" ON "symbol_links" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "symbol_links_symbol_id" ON "symbol_links" USING btree ("symbol_id");--> statement-breakpoint
CREATE INDEX "transactions_file_id" ON "transactions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_order" ON "transactions" USING btree ("ledger_id","date","sort_time","id");--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_uncounted" ON "transactions" USING btree ("ledger_id") WHERE not "transactions"."counted";--> statement-breakpoint
CREATE INDEX "transactions_description" ON "transactions" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "transactions_embedding" ON "transactions" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- What an account's counted postings of a commodity moved on one day.
CREATE VIEW "daily_deltas" AS
	SELECT ledger_id, account, account_type, commodity, date, sum(amount) AS amount
	FROM postings
	WHERE counted
	GROUP BY ledger_id, account, account_type, commodity, date;--> statement-breakpoint
SELECT attach_updated_at();
