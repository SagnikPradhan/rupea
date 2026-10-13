TRUNCATE "statement_grids";--> statement-breakpoint
ALTER TABLE "statement_grids" DROP CONSTRAINT "statement_grids_user_id_statement";--> statement-breakpoint
ALTER TABLE "statement_grids" DROP CONSTRAINT "statement_grids_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "statement_grids" ADD COLUMN "ledger_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "statement_grids" ADD CONSTRAINT "statement_grids_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_grids" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "statement_grids" ADD CONSTRAINT "statement_grids_ledger_id_statement" UNIQUE("ledger_id","statement");
