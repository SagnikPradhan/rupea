CREATE TABLE "dismissed_matches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "dismissed_matches_ledger_id_fingerprint" UNIQUE("ledger_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "dismissed_matches" ADD CONSTRAINT "dismissed_matches_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
SELECT attach_updated_at();
