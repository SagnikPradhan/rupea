CREATE TYPE "public"."problem_kind" AS ENUM('parse');--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"file_id" uuid,
	"kind" "problem_kind" NOT NULL,
	"error" jsonb NOT NULL
);
--> statement-breakpoint
-- A file that failed to parse had no version. An empty one never matches storage, so the next sync parses it once more and keeps its problems.
UPDATE "ledger_files" SET "version" = '' WHERE "version" IS NULL;--> statement-breakpoint
ALTER TABLE "ledger_files" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problems_ledger_id" ON "problems" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "problems_file_id" ON "problems" USING btree ("file_id");--> statement-breakpoint
SELECT attach_updated_at();
