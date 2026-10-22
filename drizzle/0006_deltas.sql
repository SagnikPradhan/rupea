CREATE TABLE "deltas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"commodity" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(38, 0) NOT NULL,
	CONSTRAINT "deltas_ledger_id_account_commodity_date" UNIQUE("ledger_id","account","commodity","date")
);
--> statement-breakpoint
ALTER TABLE "deltas" ADD CONSTRAINT "deltas_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deltas_ledger_id_commodity" ON "deltas" USING btree ("ledger_id","commodity");--> statement-breakpoint
SELECT attach_updated_at();--> statement-breakpoint
-- Deltas fill when each file is indexed again on its next sync.
UPDATE "ledger_files" SET "version" = NULL;
