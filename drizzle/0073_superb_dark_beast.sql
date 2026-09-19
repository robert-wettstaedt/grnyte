-- Custom SQL migration file, put your code below! --

-- Remap area types from their relationships instead of the old enum value:
--   * has child areas (subareas) -> 'area'
--   * has blocks                 -> 'crag'
--   * neither                    -> null   (organizational leaf with nothing under it)
-- Subareas win when an area has both. Single CASE so evaluation order is irrelevant.
ALTER TABLE "areas" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "areas" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
UPDATE "areas" AS a SET "type" = CASE
  WHEN EXISTS (SELECT 1 FROM "areas" c WHERE c."parent_fk" = a."id") THEN 'area'
  WHEN EXISTS (SELECT 1 FROM "blocks" b WHERE b."area_fk" = a."id") THEN 'crag'
  ELSE NULL
END;
