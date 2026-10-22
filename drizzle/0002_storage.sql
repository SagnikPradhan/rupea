CREATE TYPE "public"."storage_kind" AS ENUM('local');--> statement-breakpoint
CREATE TABLE "storages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "storage_kind" NOT NULL,
	CONSTRAINT "storages_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "storages" ADD CONSTRAINT "storages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
SELECT attach_updated_at();
