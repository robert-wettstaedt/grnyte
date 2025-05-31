CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TABLE "region_invitations" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"token" uuid NOT NULL,
	"invited_by" integer NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" integer,
	CONSTRAINT "region_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "region_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "region_invitations" ADD CONSTRAINT "region_invitations_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_invitations" ADD CONSTRAINT "region_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_invitations" ADD CONSTRAINT "region_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "region_invitations_token_idx" ON "region_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "region_invitations_region_fk_idx" ON "region_invitations" USING btree ("region_fk");--> statement-breakpoint
CREATE INDEX "region_invitations_email_idx" ON "region_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "region_invitations_status_idx" ON "region_invitations" USING btree ("status");--> statement-breakpoint
CREATE POLICY "region.admin can insert region_invitations" ON "region_invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize_in_region('region.admin', region_fk)));--> statement-breakpoint
CREATE POLICY "users can read region_invitations" ON "region_invitations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users can update region_invitations" ON "region_invitations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);