CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
DROP INDEX "transactions_ledger_id_date";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_order" ON "transactions" USING btree ("ledger_id","date",coalesce("time", '00:00'),"id");--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_uncounted" ON "transactions" USING btree ("ledger_id") WHERE not "transactions"."counted";--> statement-breakpoint
CREATE INDEX "transactions_description" ON "transactions" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
-- Every file is indexed again on its next sync, which works out what counts.
UPDATE "ledger_files" SET "version" = NULL;