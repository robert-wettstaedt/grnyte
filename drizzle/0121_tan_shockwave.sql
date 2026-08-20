DROP INDEX "favorites_entity_id_idx";--> statement-breakpoint
DROP INDEX "favorites_entity_type_idx";--> statement-breakpoint
ALTER TABLE "favorites" ALTER COLUMN "entity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ALTER COLUMN "entity_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "area_fk" integer;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "block_fk" integer;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "route_fk" integer;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_area_fk_areas_id_fk" FOREIGN KEY ("area_fk") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_block_fk_blocks_id_fk" FOREIGN KEY ("block_fk") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_route_fk_routes_id_fk" FOREIGN KEY ("route_fk") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Backfill, hand-written: the polymorphic pair becomes real keys.
--
-- The deletes run first because a foreign key cannot point at a row that is gone, and 1.0 never
-- constrained this table: `entity_id` is text, so it holds whatever was written, and nothing ever
-- removed a favorite when its route was hard-deleted. A favorite of a deleted block is not
-- something a person can open, so dropping it loses nothing they had.
DELETE FROM "favorites" WHERE "entity_id" IS NULL OR "entity_id" !~ '^[0-9]+$';--> statement-breakpoint
-- The range, not just the shape: `entity_id` is text and 1.0 never constrained it, so a single
-- oversized value would pass the digit test and then take the whole cutover down with `value out of
-- range for type integer`.
--
-- Its own statement rather than a third OR arm. Postgres does not promise to evaluate a WHERE
-- clause left to right, and it is free to hoist this cast above the regex that makes it safe: a
-- plan that did would raise 22P02 on the first `entity_id` holding a word. Sequencing the two
-- statements is the only ordering the planner cannot reorder.
DELETE FROM "favorites" WHERE "entity_id"::numeric > 2147483647;--> statement-breakpoint
DELETE FROM "favorites" AS f
  WHERE f."entity_type" = 'area'
    AND NOT EXISTS (SELECT 1 FROM "areas" a WHERE a."id" = f."entity_id"::int);--> statement-breakpoint
DELETE FROM "favorites" AS f
  WHERE f."entity_type" = 'block'
    AND NOT EXISTS (SELECT 1 FROM "blocks" b WHERE b."id" = f."entity_id"::int);--> statement-breakpoint
DELETE FROM "favorites" AS f
  WHERE f."entity_type" = 'route'
    AND NOT EXISTS (SELECT 1 FROM "routes" r WHERE r."id" = f."entity_id"::int);--> statement-breakpoint

UPDATE "favorites" SET "area_fk"  = "entity_id"::int WHERE "entity_type" = 'area';--> statement-breakpoint
UPDATE "favorites" SET "block_fk" = "entity_id"::int WHERE "entity_type" = 'block';--> statement-breakpoint
UPDATE "favorites" SET "route_fk" = "entity_id"::int WHERE "entity_type" = 'route';--> statement-breakpoint

-- Whatever the three UPDATEs did not claim carries an `entity_type` outside the three the column
-- was declared with, which no reader has ever been able to render. The CHECK below would reject it
-- and take the whole migration down with it.
DELETE FROM "favorites" WHERE num_nonnulls("area_fk", "block_fk", "route_fk") <> 1;--> statement-breakpoint

-- And the region, from the object rather than from whatever the row happened to carry. A legacy
-- favorite filed under the wrong region would otherwise stay mis-filed forever, synced to people
-- who cannot see the thing and hidden from those who can.
UPDATE "favorites" f SET "region_fk" = a."region_fk" FROM "areas" a
  WHERE a."id" = f."area_fk" AND a."region_fk" IS DISTINCT FROM f."region_fk";--> statement-breakpoint
UPDATE "favorites" f SET "region_fk" = b."region_fk" FROM "blocks" b
  WHERE b."id" = f."block_fk" AND b."region_fk" IS DISTINCT FROM f."region_fk";--> statement-breakpoint
UPDATE "favorites" f SET "region_fk" = r."region_fk" FROM "routes" r
  WHERE r."id" = f."route_fk" AND r."region_fk" IS DISTINCT FROM f."region_fk";--> statement-breakpoint

-- Nothing ever stopped the same thing being saved twice, so the unique indexes below would fail on
-- data that has been legal since 1.0. Keep the oldest row of each set, which is the one the profile
-- list has always shown.
DELETE FROM "favorites" f
  USING "favorites" keep
  WHERE keep."user_fk" = f."user_fk"
    AND keep."id" < f."id"
    AND (
      (f."area_fk" IS NOT NULL AND keep."area_fk" = f."area_fk")
      OR (f."block_fk" IS NOT NULL AND keep."block_fk" = f."block_fk")
      OR (f."route_fk" IS NOT NULL AND keep."route_fk" = f."route_fk")
    );--> statement-breakpoint

CREATE INDEX "favorites_area_fk_idx" ON "favorites" USING btree ("area_fk") WHERE area_fk is not null;--> statement-breakpoint
CREATE INDEX "favorites_block_fk_idx" ON "favorites" USING btree ("block_fk") WHERE block_fk is not null;--> statement-breakpoint
CREATE INDEX "favorites_route_fk_idx" ON "favorites" USING btree ("route_fk") WHERE route_fk is not null;--> statement-breakpoint
CREATE INDEX "favorites_user_fk_idx" ON "favorites" USING btree ("user_fk");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_area_idx" ON "favorites" USING btree ("user_fk","area_fk") WHERE area_fk is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_block_idx" ON "favorites" USING btree ("user_fk","block_fk") WHERE block_fk is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_route_idx" ON "favorites" USING btree ("user_fk","route_fk") WHERE route_fk is not null;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_one_object" CHECK (num_nonnulls(area_fk, block_fk, route_fk) = 1);--> statement-breakpoint

ALTER TABLE "favorites" DROP COLUMN "entity_id";--> statement-breakpoint
ALTER TABLE "favorites" DROP COLUMN "entity_type";
