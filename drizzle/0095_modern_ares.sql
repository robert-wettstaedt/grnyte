CREATE TABLE "notifications" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"region_fk" integer NOT NULL,
	"actor_fk" integer NOT NULL,
	"auth_user_fk" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"metadata" text,
	"read_at" timestamp with time zone,
	"source_type" text NOT NULL,
	"user_fk" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_region_fk_regions_id_fk" FOREIGN KEY ("region_fk") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_fk_users_id_fk" FOREIGN KEY ("actor_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fk_users_id_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_source_idx" ON "notifications" USING btree ("user_fk","source_type","entity_type","entity_id","actor_fk");--> statement-breakpoint
CREATE INDEX "notifications_user_fk_read_at_idx" ON "notifications" USING btree ("user_fk","read_at");--> statement-breakpoint
CREATE INDEX "notifications_region_fk_idx" ON "notifications" USING btree ("region_fk");--> statement-breakpoint
CREATE POLICY "users can read own notifications" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk AND (SELECT authorize_in_region('region.read', region_fk)));--> statement-breakpoint
CREATE POLICY "users can update own notifications" ON "notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = auth_user_fk) WITH CHECK ((SELECT auth.uid()) = auth_user_fk);--> statement-breakpoint
-- WHICH COLUMN is not something an RLS policy can say, and Supabase grants `authenticated` a
-- table-wide UPDATE by default, so the own-rows policy above still leaves `PATCH
-- /rest/v1/notifications` free to rewrite a row's source type, actor and metadata with a plain
-- user JWT. Narrowing the grant is the only thing that makes "the read stamp and nothing else"
-- true. `setup-table-permissions` only revokes from anon/public, so it does not undo this.
REVOKE UPDATE ON TABLE "notifications" FROM authenticated;--> statement-breakpoint
GRANT UPDATE ("read_at") ON TABLE "notifications" TO authenticated;
