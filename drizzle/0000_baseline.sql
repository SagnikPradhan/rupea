CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('Assets', 'Liabilities', 'Income', 'Expenses', 'Equity');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('unit', 'total');--> statement-breakpoint
CREATE TYPE "public"."storage_kind" AS ENUM('local');--> statement-breakpoint
CREATE TABLE "dismissed_matches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "dismissed_matches_ledger_id_fingerprint" UNIQUE("ledger_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_codes_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"partition" text NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"error" jsonb
);
--> statement-breakpoint
CREATE TABLE "ledger_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"key" text NOT NULL,
	"version" text,
	CONSTRAINT "ledger_files_ledger_id_key" UNIQUE("ledger_id","key")
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"storage_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "ledgers_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	CONSTRAINT "memberships_user_id_ledger_id" UNIQUE("user_id","ledger_id")
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"file_id" uuid,
	"transaction_id" uuid,
	"posting_id" uuid,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "metadata_one_owner" CHECK (num_nonnulls("metadata"."file_id", "metadata"."transaction_id", "metadata"."posting_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"account" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"amount" bigint NOT NULL,
	"commodity" text NOT NULL,
	"price_amount" bigint,
	"price_commodity" text,
	"price_kind" "price_kind",
	"balance" bigint
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "statement_grids" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checksum" text NOT NULL,
	"reader" text NOT NULL,
	"grid" jsonb NOT NULL,
	"text" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "statement_grids_checksum_reader" UNIQUE("checksum","reader")
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"path" text NOT NULL,
	"checksum" text NOT NULL,
	"original" text,
	CONSTRAINT "statements_ledger_id_path" UNIQUE("ledger_id","path")
);
--> statement-breakpoint
CREATE TABLE "storages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "storage_kind" NOT NULL,
	CONSTRAINT "storages_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"date" date NOT NULL,
	"time" time,
	"description" text NOT NULL,
	"embedding" vector(384),
	"embedding_model" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "dismissed_matches" ADD CONSTRAINT "dismissed_matches_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_files" ADD CONSTRAINT "ledger_files_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_storage_id_storages_id_fk" FOREIGN KEY ("storage_id") REFERENCES "public"."storages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storages" ADD CONSTRAINT "storages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_id_name_dedupe_queued" ON "jobs" USING btree ("user_id","name","dedupe") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_name_partition_running" ON "jobs" USING btree ("name","partition") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_run_at_queued" ON "jobs" USING btree ("run_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_leased_until_running" ON "jobs" USING btree ("leased_until") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_status_updated_at" ON "jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_user_id_created_at" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledgers_storage_id" ON "ledgers" USING btree ("storage_id");--> statement-breakpoint
CREATE INDEX "metadata_file_id" ON "metadata" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "metadata_transaction_id" ON "metadata" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "metadata_posting_id" ON "metadata" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "metadata_ledger_id_key_value" ON "metadata" USING btree ("ledger_id","key","value");--> statement-breakpoint
CREATE INDEX "postings_transaction_id" ON "postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_account_amount" ON "postings" USING btree ("ledger_id","account","commodity","amount");--> statement-breakpoint
CREATE INDEX "postings_ledger_id_balance" ON "postings" USING btree ("ledger_id","account","commodity") WHERE "postings"."balance" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "statement_grids_expires_at" ON "statement_grids" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "statements_ledger_id_checksum" ON "statements" USING btree ("ledger_id","checksum");--> statement-breakpoint
CREATE INDEX "statements_ledger_id_original" ON "statements" USING btree ("ledger_id","original");--> statement-breakpoint
CREATE INDEX "transactions_file_id" ON "transactions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "transactions_ledger_id_date" ON "transactions" USING btree ("ledger_id","date");--> statement-breakpoint
CREATE INDEX "transactions_embedding" ON "transactions" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
-- Gives every table with an `updated_at` the trigger; safe to call again.
CREATE FUNCTION attach_updated_at() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	t text;
BEGIN
	FOR t IN
		SELECT table_name FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'updated_at'
	LOOP
		EXECUTE format(
			'CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
			t
		);
	END LOOP;
END;
$$;--> statement-breakpoint
SELECT attach_updated_at();
