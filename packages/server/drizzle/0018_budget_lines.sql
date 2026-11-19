CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account" text NOT NULL,
	"since" date,
	"keys" jsonb NOT NULL,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_lines_ledger_id_account" ON "budget_lines" USING btree ("ledger_id","account");--> statement-breakpoint
CREATE INDEX "budget_lines_file_id" ON "budget_lines" USING btree ("file_id");--> statement-breakpoint
SELECT attach_updated_at();