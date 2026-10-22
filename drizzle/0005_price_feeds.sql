ALTER TYPE "public"."feed" ADD VALUE 'mfapi';--> statement-breakpoint
ALTER TYPE "public"."feed" ADD VALUE 'yahoo';--> statement-breakpoint
ALTER TYPE "public"."price_source" ADD VALUE 'mfapi';--> statement-breakpoint
ALTER TYPE "public"."price_source" ADD VALUE 'yahoo';--> statement-breakpoint
CREATE TABLE "symbol_fetches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone,
	"failing_since" timestamp with time zone,
	"error" jsonb,
	CONSTRAINT "symbol_fetches_symbol_id_unique" UNIQUE("symbol_id")
);
--> statement-breakpoint
CREATE TABLE "symbol_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"since" date,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "line" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "symbol_fetches" ADD CONSTRAINT "symbol_fetches_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_links" ADD CONSTRAINT "symbol_links_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_links" ADD CONSTRAINT "symbol_links_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_links" ADD CONSTRAINT "symbol_links_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "symbol_links_ledger_id_alias" ON "symbol_links" USING btree ("ledger_id","alias");--> statement-breakpoint
CREATE INDEX "symbol_links_file_id" ON "symbol_links" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "symbol_links_symbol_id" ON "symbol_links" USING btree ("symbol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_symbol_id_date_quoted" ON "prices" USING btree ("symbol_id","date") WHERE "prices"."file_id" is null;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_read_from_files" CHECK (("prices"."source" in ('line', 'posting')) = ("prices"."file_id" is not null and "prices"."line" is not null));