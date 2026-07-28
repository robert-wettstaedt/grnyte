-- Freeze each region's current vocabulary before the table goes. Without this, `DEFAULT_TAGS` in
-- `region/mapLayers.ts` would be a constant every unconfigured region tracks LIVE, so editing that
-- array would retroactively rewrite vocabularies communities had already been using. Afterwards the
-- zod default is only the fallback for regions created later.
-- Reads the real table with a literal fallback on purpose: no migration or seed file ever inserted
-- those seven rows (hand-made data, like `grades`), so a from-empty `npm run migrate` finds the
-- table empty and would otherwise write `null`.
UPDATE "regions"
SET "settings" = coalesce("settings", '{}'::jsonb) || jsonb_build_object(
  'tags',
  coalesce(
    (SELECT jsonb_agg(t."id" ORDER BY t."id") FROM "tags" t),
    '["SD","benchmark","defined","high","project","trav-l-r","trav-r-l"]'::jsonb
  )
)
WHERE "settings" -> 'tags' IS NULL;--> statement-breakpoint
-- Reordered from what drizzle-kit generated: it emitted the DROP TABLE above this line, and the
-- CASCADE there takes the constraint with it, so the ALTER would then fail on a constraint that no
-- longer exists.
ALTER TABLE "routes_to_tags" DROP CONSTRAINT "routes_to_tags_tag_fk_tags_id_fk";--> statement-breakpoint
DROP POLICY "app.admin can fully access tags" ON "tags" CASCADE;--> statement-breakpoint
DROP POLICY "authenticated users can read tags" ON "tags" CASCADE;--> statement-breakpoint
DROP TABLE "tags" CASCADE;
