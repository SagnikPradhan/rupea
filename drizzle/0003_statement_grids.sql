CREATE TABLE "statement_grids" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"checksum" text NOT NULL,
	"reader" text NOT NULL,
	"grid" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "statement_grids_user_id_statement" UNIQUE("user_id","statement")
);
--> statement-breakpoint
ALTER TABLE "statement_grids" ADD CONSTRAINT "statement_grids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_grids_expires_at" ON "statement_grids" USING btree ("expires_at");