CREATE TABLE "account_terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account" text NOT NULL,
	"since" date,
	"terms" jsonb NOT NULL,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_terms" ADD CONSTRAINT "account_terms_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_terms" ADD CONSTRAINT "account_terms_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_terms_ledger_id_account" ON "account_terms" USING btree ("ledger_id","account");--> statement-breakpoint
CREATE INDEX "account_terms_file_id" ON "account_terms" USING btree ("file_id");--> statement-breakpoint
SELECT attach_updated_at();