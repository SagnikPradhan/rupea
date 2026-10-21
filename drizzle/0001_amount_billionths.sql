ALTER TABLE "disposals" ALTER COLUMN "units" SET DATA TYPE numeric(38, 0) USING "units" * 1000;--> statement-breakpoint
ALTER TABLE "disposals" ALTER COLUMN "price_amount" SET DATA TYPE numeric(38, 0) USING "price_amount" * 1000;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "units" SET DATA TYPE numeric(38, 0) USING "units" * 1000;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "remaining" SET DATA TYPE numeric(38, 0) USING "remaining" * 1000;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "cost_amount" SET DATA TYPE numeric(38, 0) USING "cost_amount" * 1000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "amount" SET DATA TYPE numeric(38, 0) USING "amount" * 1000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "price_amount" SET DATA TYPE numeric(38, 0) USING "price_amount" * 1000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "cost_amount" SET DATA TYPE numeric(38, 0) USING "cost_amount" * 1000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "balance" SET DATA TYPE numeric(38, 0) USING "balance" * 1000;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "price_amount" SET DATA TYPE numeric(38, 0) USING "price_amount" * 1000;