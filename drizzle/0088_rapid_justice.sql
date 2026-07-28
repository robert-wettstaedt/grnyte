ALTER TABLE "region_invitations" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "contact_locale" text;--> statement-breakpoint
CREATE UNIQUE INDEX "region_members_region_user_unique" ON "region_members" USING btree ("region_fk","user_fk");