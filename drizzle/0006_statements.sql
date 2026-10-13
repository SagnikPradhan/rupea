TRUNCATE "statement_grids";--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"path" text NOT NULL,
	"checksum" text NOT NULL,
	"original" text,
	CONSTRAINT "statements_ledger_id_path" UNIQUE("ledger_id","path")
);
--> statement-breakpoint
ALTER TABLE "statement_grids" DROP CONSTRAINT "statement_grids_ledger_id_statement";--> statement-breakpoint
ALTER TABLE "statement_grids" DROP CONSTRAINT "statement_grids_ledger_id_ledgers_id_fk";
--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statements_ledger_id_checksum" ON "statements" USING btree ("ledger_id","checksum");--> statement-breakpoint
ALTER TABLE "statement_grids" DROP COLUMN "ledger_id";--> statement-breakpoint
ALTER TABLE "statement_grids" DROP COLUMN "statement";--> statement-breakpoint
ALTER TABLE "statement_grids" ADD CONSTRAINT "statement_grids_checksum_reader" UNIQUE("checksum","reader");
