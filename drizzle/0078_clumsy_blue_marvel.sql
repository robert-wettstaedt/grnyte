ALTER TABLE "files" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Backfill existing rows from their `uploaded` activity. File ids were re-minted
-- in an earlier migration, so match on BOTH the current id and the old id still
-- embedded in the storage-path basename (e.g. '/topos/216.jpg' -> old id 216).
-- Video rows have path = '' (no basename to mine), so they match on the current
-- id only; the path arm is guarded so their empty basename can't join anything.
UPDATE "files" f SET "created_at" = COALESCE(
  (SELECT min(a."created_at") FROM "activities" a
     WHERE a."type" = 'uploaded' AND a."entity_type" = 'file' AND a."entity_id" = f."id"),
  (SELECT min(a."created_at") FROM "activities" a
     WHERE a."type" = 'uploaded' AND a."entity_type" = 'file'
       AND f."path" <> '' AND a."entity_id" = split_part(split_part(f."path", '/', -1), '.', 1)),
  f."created_at"
)
WHERE EXISTS (
  SELECT 1 FROM "activities" a
  WHERE a."type" = 'uploaded' AND a."entity_type" = 'file'
    AND (a."entity_id" = f."id" OR (f."path" <> '' AND a."entity_id" = split_part(split_part(f."path", '/', -1), '.', 1)))
);--> statement-breakpoint
-- Files with no upload activity (bulk-imported/seeded) have no recorded upload
-- time; approximate it from the parent entity's created_at so they don't all
-- cluster at the now() default. Cosmetic ordering only; keeps now() if no parent.
UPDATE "files" f SET "created_at" = COALESCE(
  (SELECT b."created_at" FROM "blocks" b WHERE b."id" = f."block_fk"),
  (SELECT r."created_at" FROM "routes" r WHERE r."id" = f."route_fk"),
  (SELECT ar."created_at" FROM "areas" ar WHERE ar."id" = f."area_fk"),
  (SELECT asc2."created_at" FROM "ascents" asc2 WHERE asc2."id" = f."ascent_fk"),
  f."created_at"
)
WHERE NOT EXISTS (
  SELECT 1 FROM "activities" a
  WHERE a."type" = 'uploaded' AND a."entity_type" = 'file'
    AND (a."entity_id" = f."id" OR (f."path" <> '' AND a."entity_id" = split_part(split_part(f."path", '/', -1), '.', 1)))
);
