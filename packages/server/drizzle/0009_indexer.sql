-- Files indexed before the indexer was recorded count as indexed by an older one, so the next sync indexes them again.
ALTER TABLE "ledger_files" ADD COLUMN "indexer" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ledger_files" ALTER COLUMN "indexer" DROP DEFAULT;
