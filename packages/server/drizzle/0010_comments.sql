-- Comments fill in when the next sync indexes every file again, as the indexer went up.
ALTER TABLE "postings" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "comment" text;
