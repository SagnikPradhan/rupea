CREATE TABLE "statement_contents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checksum" text NOT NULL,
	"reader" text NOT NULL,
	"grid" jsonb NOT NULL,
	"text" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "statement_contents_checksum_reader" UNIQUE("checksum","reader")
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"key" text NOT NULL,
	"checksum" text NOT NULL,
	"original_checksum" text,
	CONSTRAINT "statements_ledger_id_key" UNIQUE("ledger_id","key")
);
--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_contents_expires_at" ON "statement_contents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "statements_ledger_id_checksum" ON "statements" USING btree ("ledger_id","checksum");--> statement-breakpoint
CREATE INDEX "statements_ledger_id_original_checksum" ON "statements" USING btree ("ledger_id","original_checksum");--> statement-breakpoint
CREATE INDEX "statements_ledger_id_created_at" ON "statements" USING btree ("ledger_id","created_at" DESC NULLS LAST);--> statement-breakpoint
SELECT attach_updated_at();
