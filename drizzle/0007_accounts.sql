CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_ledger_id_lower_name" ON "accounts" USING btree ("ledger_id",lower("name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX "accounts_parent_id" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
INSERT INTO "accounts" ("ledger_id", "name", "type")
	SELECT "ledger_id", min("name"), "type"
	FROM (
		SELECT n."ledger_id", array_to_string(n."levels"[1:i], ':') AS "name", n."type"
		FROM (SELECT DISTINCT "ledger_id", string_to_array("account", ':') AS "levels", "account_type" AS "type" FROM "postings") n,
			generate_series(1, cardinality(n."levels")) i
	) a
	GROUP BY "ledger_id", lower("name"), "type";--> statement-breakpoint
UPDATE "accounts" c SET "parent_id" = p."id"
	FROM "accounts" p
	WHERE p."ledger_id" = c."ledger_id"
		AND position(':' in c."name") > 0
		AND lower(p."name") = lower(regexp_replace(c."name", ':[^:]*$', ''));--> statement-breakpoint
DROP VIEW "daily_deltas";--> statement-breakpoint
ALTER TABLE "monthly_deltas" DROP CONSTRAINT "monthly_deltas_ledger_id_account_commodity_month";--> statement-breakpoint
DROP INDEX "lots_ledger_id_commodity_account";--> statement-breakpoint
DROP INDEX "postings_ledger_id_account_amount";--> statement-breakpoint
DROP INDEX "postings_ledger_id_account_date";--> statement-breakpoint
DROP INDEX "postings_ledger_id_lower_account";--> statement-breakpoint
DROP INDEX "postings_ledger_id_balance";--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "account_id" uuid;--> statement-breakpoint
UPDATE "postings" x SET "account_id" = a."id" FROM "accounts" a WHERE a."ledger_id" = x."ledger_id" AND lower(a."name") = lower(x."account");--> statement-breakpoint
UPDATE "lots" x SET "account_id" = a."id" FROM "accounts" a WHERE a."ledger_id" = x."ledger_id" AND lower(a."name") = lower(x."account");--> statement-breakpoint
DELETE FROM "monthly_deltas" x WHERE NOT EXISTS (SELECT FROM "accounts" a WHERE a."ledger_id" = x."ledger_id" AND lower(a."name") = lower(x."account"));--> statement-breakpoint
UPDATE "monthly_deltas" x SET "account_id" = a."id" FROM "accounts" a WHERE a."ledger_id" = x."ledger_id" AND lower(a."name") = lower(x."account");--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" DROP COLUMN "account";--> statement-breakpoint
ALTER TABLE "monthly_deltas" DROP COLUMN "account";--> statement-breakpoint
ALTER TABLE "postings" DROP COLUMN "account";--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ADD CONSTRAINT "monthly_deltas_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lots_ledger_id_commodity_account_id" ON "lots" USING btree ("ledger_id","commodity","account_id");--> statement-breakpoint
CREATE INDEX "postings_account_id_commodity_amount" ON "postings" USING btree ("account_id","commodity","amount");--> statement-breakpoint
CREATE INDEX "postings_account_id_commodity_date" ON "postings" USING btree ("account_id","commodity","date");--> statement-breakpoint
CREATE INDEX "postings_account_id_date" ON "postings" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_balance" ON "postings" USING btree ("ledger_id","account_id","commodity") WHERE "postings"."balance" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_deltas" ADD CONSTRAINT "monthly_deltas_ledger_id_account_id_commodity_month" UNIQUE("ledger_id","account_id","commodity","month");--> statement-breakpoint
CREATE VIEW "daily_deltas" AS
	SELECT ledger_id, account_id, account_type, commodity, date, sum(amount) AS amount
	FROM postings
	WHERE counted
	GROUP BY ledger_id, account_id, account_type, commodity, date;--> statement-breakpoint
SELECT attach_updated_at();
