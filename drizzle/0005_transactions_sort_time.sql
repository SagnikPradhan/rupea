DROP INDEX "transactions_ledger_id_order";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sort_time" time GENERATED ALWAYS AS (coalesce("time", '00:00')) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_order" ON "transactions" USING btree ("ledger_id","date","sort_time","id");