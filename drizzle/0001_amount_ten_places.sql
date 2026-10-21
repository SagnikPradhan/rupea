ALTER TABLE "disposals" ALTER COLUMN "units" SET DATA TYPE numeric(38, 0) USING "units" * 10000;--> statement-breakpoint
ALTER TABLE "disposals" ALTER COLUMN "price_amount" SET DATA TYPE numeric(38, 0) USING "price_amount" * 10000;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "units" SET DATA TYPE numeric(38, 0) USING "units" * 10000;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "remaining" SET DATA TYPE numeric(38, 0) USING "remaining" * 10000;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "cost_amount" SET DATA TYPE numeric(38, 0) USING "cost_amount" * 10000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "amount" SET DATA TYPE numeric(38, 0) USING "amount" * 10000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "price_amount" SET DATA TYPE numeric(38, 0) USING "price_amount" * 10000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "cost_amount" SET DATA TYPE numeric(38, 0) USING "cost_amount" * 10000;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "balance" SET DATA TYPE numeric(38, 0) USING "balance" * 10000;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "price_amount" SET DATA TYPE numeric(38, 0) USING "price_amount" * 10000;