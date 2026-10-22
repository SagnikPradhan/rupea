CREATE TYPE "public"."feed" AS ENUM('ledger');--> statement-breakpoint
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
SELECT attach_updated_at();--> statement-breakpoint
-- Prices move onto symbols when each file is indexed again on its next sync.
DELETE FROM "prices";--> statement-breakpoint
UPDATE "ledger_files" SET "version" = NULL;--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "prices_ledger_id_ledgers_id_fk";
--> statement-breakpoint
DROP INDEX "prices_ledger_id_commodity_date";--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "symbol_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prices_symbol_id_date" ON "prices" USING btree ("symbol_id","date");--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "ledger_id";--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "commodity";