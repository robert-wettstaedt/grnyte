-- Add nullable first, backfill, then enforce NOT NULL. The column has no
-- scalar default, so a straight NOT NULL add would abort on existing rows.
ALTER TABLE "files" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Tier 1: the uploader recorded on the file's `uploaded` activity. Match on BOTH
-- the current id and the old id still embedded in the path basename (file ids were
-- re-minted in an earlier migration, see 0078). Earliest activity wins. The path
-- arm is guarded so a video row's empty basename can't join a stray activity.
UPDATE "files" f SET "created_by" = (
  SELECT a."user_fk" FROM "activities" a
    WHERE a."type" = 'uploaded' AND a."entity_type" = 'file'
      AND (a."entity_id" = f."id" OR (f."path" <> '' AND a."entity_id" = split_part(split_part(f."path", '/', -1), '.', 1)))
    ORDER BY a."created_at" ASC LIMIT 1
)
WHERE f."created_by" IS NULL AND EXISTS (
  SELECT 1 FROM "activities" a
    WHERE a."type" = 'uploaded' AND a."entity_type" = 'file'
      AND (a."entity_id" = f."id" OR (f."path" <> '' AND a."entity_id" = split_part(split_part(f."path", '/', -1), '.', 1)))
);--> statement-breakpoint
-- Tier 2: the parent entity's creator. Media is nearly always uploaded by whoever
-- created the entity it hangs on: topos by the block/route/area creator, ascent
-- media by the climber. Verified against the prod mirror: this agrees with every
-- authoritative signal available there (upload activities, the uploader auth uid
-- embedded in '/user-content/<uid>/' paths, and the Bunny collection owners of
-- the resolvable videos), so no path or Bunny lookups are kept.
UPDATE "files" f SET "created_by" = COALESCE(
  (SELECT b."created_by" FROM "blocks" b WHERE b."id" = f."block_fk"),
  (SELECT r."created_by" FROM "routes" r WHERE r."id" = f."route_fk"),
  (SELECT ar."created_by" FROM "areas" ar WHERE ar."id" = f."area_fk"),
  (SELECT asc2."created_by" FROM "ascents" asc2 WHERE asc2."id" = f."ascent_fk")
)
WHERE f."created_by" IS NULL;--> statement-breakpoint
-- Tier 3 (fallback): the region's creator. region_fk and regions.created_by are
-- both NOT NULL, so this fills every remaining row (guaranteeing the NOT NULL
-- below): files without a parent entity.
UPDATE "files" f SET "created_by" = r."created_by"
FROM "regions" r
WHERE f."created_by" IS NULL AND r."id" = f."region_fk";--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "files_created_by_idx" ON "files" USING btree ("created_by");
