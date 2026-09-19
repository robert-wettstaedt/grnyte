DROP INDEX "notifications_source_idx";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "area_fk" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "ascent_fk" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "block_fk" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "file_fk" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "route_fk" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_fk" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "object_key" text GENERATED ALWAYS AS (case
        when area_fk is not null then 'area:' || area_fk
        when ascent_fk is not null then 'ascent:' || ascent_fk
        when block_fk is not null then 'block:' || block_fk
        when file_fk is not null then 'file:' || file_fk
        when route_fk is not null then 'route:' || route_fk
        when subject_fk is not null then 'user:' || subject_fk
        else ''
      end) STORED;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ascent_fk_ascents_id_fk" FOREIGN KEY ("ascent_fk") REFERENCES "public"."ascents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_file_fk_files_id_fk" FOREIGN KEY ("file_fk") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_fk_users_id_fk" FOREIGN KEY ("subject_fk") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Backfill the typed columns from the polymorphic pair, BEFORE the unique index below is built on
-- the key derived from them: with every row still reading as the empty object key, two rows that
-- differ only by entity would collide and the index would refuse to create.
--
-- `EXISTS` on each, because there is no foreign key on the pair today and rows pointing at a
-- hard-deleted entity are real (the dev seed plants one on purpose). Those keep their sentence and
-- end up with no object at all, which is what the three source types that never had a row already
-- look like. `entity_id ~ '^[0-9]+$'` guards the cast for the same reason: nothing checks that
-- column today.
UPDATE "notifications" n SET "area_fk" = n."entity_id"::int
WHERE n."entity_type" = 'area' AND n."entity_id" ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM "areas" t WHERE t."id" = n."entity_id"::int);--> statement-breakpoint
UPDATE "notifications" n SET "ascent_fk" = n."entity_id"::int
WHERE n."entity_type" = 'ascent' AND n."entity_id" ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM "ascents" t WHERE t."id" = n."entity_id"::int);--> statement-breakpoint
UPDATE "notifications" n SET "block_fk" = n."entity_id"::int
WHERE n."entity_type" = 'block' AND n."entity_id" ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM "blocks" t WHERE t."id" = n."entity_id"::int);--> statement-breakpoint
UPDATE "notifications" n SET "route_fk" = n."entity_id"::int
WHERE n."entity_type" = 'route' AND n."entity_id" ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM "routes" t WHERE t."id" = n."entity_id"::int);--> statement-breakpoint
UPDATE "notifications" n SET "subject_fk" = n."entity_id"::int
WHERE n."entity_type" = 'user' AND n."entity_id" ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM "users" t WHERE t."id" = n."entity_id"::int);--> statement-breakpoint

-- Two rows that were distinct only through the polymorphic pair are one row under the new key when
-- neither resolved, so drop the older of any such pair before the unique index goes on.
DELETE FROM "notifications" a
USING "notifications" b
WHERE a."event_fk" IS NULL AND b."event_fk" IS NULL
  AND a."user_fk" = b."user_fk" AND a."source_type" = b."source_type" AND a."actor_fk" = b."actor_fk"
  AND a."object_key" = b."object_key" AND a."id" < b."id";--> statement-breakpoint

CREATE UNIQUE INDEX "notifications_source_idx" ON "notifications" USING btree ("user_fk","source_type","actor_fk","object_key") WHERE event_fk is null;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_at_most_one_object" CHECK (num_nonnulls(area_fk, ascent_fk, block_fk, file_fk, route_fk, subject_fk) <= 1);
