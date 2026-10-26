CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_ledger_id_lower_name" ON "accounts" USING btree ("ledger_id",lower("name") text_pattern_ops);--> statement-breakpoint
INSERT INTO "accounts" ("ledger_id", "name", "type")
	SELECT "ledger_id", min("account"), "account_type" FROM "postings" GROUP BY "ledger_id", lower("account"), "account_type";--> statement-breakpoint
SELECT attach_updated_at();
