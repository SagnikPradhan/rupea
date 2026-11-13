CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
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
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_id_name_dedupe_queued" ON "jobs" USING btree ("user_id","name","dedupe") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_name_partition_running" ON "jobs" USING btree ("name","partition") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_run_at_queued" ON "jobs" USING btree ("run_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_leased_until_running" ON "jobs" USING btree ("leased_until") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_status_updated_at" ON "jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_user_id_created_at" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
SELECT attach_updated_at();
