CREATE TABLE "favorites" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"user_fk" integer NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorites_created_at_idx" ON "favorites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "favorites_entity_id_idx" ON "favorites" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "favorites_entity_type_idx" ON "favorites" USING btree ("entity_type");--> statement-breakpoint
CREATE POLICY "users can insert own favorites" ON "favorites" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "region.read can read favorites" ON "favorites" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "users can update own favorites" ON "favorites" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
CREATE POLICY "users can delete own favorites" ON "favorites" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint