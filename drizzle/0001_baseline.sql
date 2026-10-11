CREATE TYPE "public"."price_kind" AS ENUM('unit', 'total');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner');--> statement-breakpoint
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
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"model" text NOT NULL,
	"text" text NOT NULL,
	"vector" vector(384) NOT NULL,
	CONSTRAINT "embeddings_ledger_id_model_text" UNIQUE("ledger_id","model","text")
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
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "memberships_user_id_ledger_id" UNIQUE("user_id","ledger_id")
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
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
	"transaction_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"account" text NOT NULL,
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
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"date" date NOT NULL,
	"time" time,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"ledger_id" uuid,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "dismissed_matches" ADD CONSTRAINT "dismissed_matches_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_files" ADD CONSTRAINT "ledger_files_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_file_id_ledger_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ledger_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embeddings_vector" ON "embeddings" USING hnsw ("vector" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "metadata_file_id" ON "metadata" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "metadata_transaction_id" ON "metadata" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "metadata_posting_id" ON "metadata" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "metadata_key_value" ON "metadata" USING btree ("key","value");--> statement-breakpoint
CREATE INDEX "postings_transaction_id" ON "postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "postings_account_amount" ON "postings" USING btree ("account","commodity","amount");--> statement-breakpoint
CREATE INDEX "postings_account_prefix" ON "postings" USING btree ("account" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "postings_account_trgm" ON "postings" USING gin ("account" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "postings_balance" ON "postings" USING btree ("account","commodity") WHERE "postings"."balance" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_file_id" ON "transactions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "transactions_description_trgm" ON "transactions" USING gin ("description" gin_trgm_ops);