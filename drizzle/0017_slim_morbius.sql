CREATE TABLE IF NOT EXISTS "entity_to_storage_objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"area_fk" integer,
	"ascent_fk" integer,
	"route_fk" integer,
	"block_fk" integer,
	"storage_object_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_to_storage_objects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage"."objects" (
	"bucket_id" text,
	"created_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"metadata" jsonb,
	"name" text,
	"owner" uuid,
	"path_tokens" text[],
	"updated_at" timestamp with time zone,
	"user_metadata" jsonb,
	"version" text
);
--> statement-breakpoint
ALTER TABLE "topos" ADD COLUMN "storage_object_fk" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_to_storage_objects" ADD CONSTRAINT "entity_to_storage_objects_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_to_storage_objects" ADD CONSTRAINT "entity_to_storage_objects_ascent_fk_ascents_id_fk" FOREIGN KEY ("ascent_fk") REFERENCES "public"."ascents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_to_storage_objects" ADD CONSTRAINT "entity_to_storage_objects_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_to_storage_objects" ADD CONSTRAINT "entity_to_storage_objects_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_to_storage_objects" ADD CONSTRAINT "entity_to_storage_objects_storage_object_id_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "storage"."objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_to_storage_objects_area_fk_idx" ON "entity_to_storage_objects" USING btree ("area_fk");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_to_storage_objects_ascent_fk_idx" ON "entity_to_storage_objects" USING btree ("ascent_fk");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_to_storage_objects_block_fk_idx" ON "entity_to_storage_objects" USING btree ("block_fk");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_to_storage_objects_route_fk_idx" ON "entity_to_storage_objects" USING btree ("route_fk");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topos" ADD CONSTRAINT "topos_storage_object_fk_entity_to_storage_objects_id_fk" FOREIGN KEY ("storage_object_fk") REFERENCES "public"."entity_to_storage_objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE POLICY "data.read can insert entity_to_storage_objects" ON "entity_to_storage_objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT authorize('data.read')));--> statement-breakpoint
CREATE POLICY "data.read can read entity_to_storage_objects" ON "entity_to_storage_objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT authorize('data.read')));--> statement-breakpoint
CREATE POLICY "data.read can update entity_to_storage_objects belonging to their own ascents" ON "entity_to_storage_objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          )
        ) WITH CHECK (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          )
        );--> statement-breakpoint
CREATE POLICY "data.read can delete entity_to_storage_objects belonging to their own ascents" ON "entity_to_storage_objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          )
        );--> statement-breakpoint
CREATE POLICY "data.edit can update entity_to_storage_objects" ON "entity_to_storage_objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT authorize('data.edit'))) WITH CHECK ((SELECT authorize('data.edit')));--> statement-breakpoint
CREATE POLICY "data.delete can delete entity_to_storage_objects" ON "entity_to_storage_objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT authorize('data.delete')));--> statement-breakpoint
CREATE POLICY "data.read can fully access entity_to_storage_objects" ON "entity_to_storage_objects" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT authorize('data.read'))) WITH CHECK ((SELECT authorize('data.read')));