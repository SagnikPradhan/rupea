ALTER TABLE "ledgers" DROP CONSTRAINT "ledgers_storage_id_storages_id_fk";
--> statement-breakpoint
DROP INDEX "ledgers_storage_id";--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "ledgers" SET "owner_id" = "storages"."user_id" FROM "storages" WHERE "storages"."id" = "ledgers"."storage_id";--> statement-breakpoint
ALTER TABLE "ledgers" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledgers_owner_id" ON "ledgers" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "ledgers" DROP COLUMN "storage_id";
