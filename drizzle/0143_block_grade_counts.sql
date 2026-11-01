ALTER TABLE "blocks" ADD COLUMN "grade_counts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- A trigger rather than writes in the route handlers: a read-only member regrades a route by logging an ascent
-- (`recalcUserGradeAndRating` runs as the caller), and the `blocks` policy refuses them an update, so the count
-- would freeze silently. SECURITY DEFINER for that reason, with the search path pinned (as 0115).
-- One UPDATE per side, read and written in the same statement, so concurrent writers serialize on the block row.
CREATE OR REPLACE FUNCTION public.sync_block_grade_counts() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  was_live boolean := TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL;
  is_live boolean := TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL;
  old_key text := CASE WHEN TG_OP <> 'INSERT' THEN coalesce(OLD.user_grade_fk::text, 'none') END;
  new_key text := CASE WHEN TG_OP <> 'DELETE' THEN coalesce(NEW.user_grade_fk::text, 'none') END;
BEGIN
  IF was_live AND is_live AND OLD.block_fk = NEW.block_fk AND old_key = new_key THEN
    RETURN NULL;
  END IF;
  IF was_live THEN
    UPDATE public.blocks SET grade_counts = CASE
        WHEN coalesce((grade_counts ->> old_key)::int, 0) <= 1 THEN grade_counts - old_key
        ELSE jsonb_set(grade_counts, ARRAY[old_key], to_jsonb((grade_counts ->> old_key)::int - 1))
      END
    WHERE id = OLD.block_fk;
  END IF;
  IF is_live THEN
    UPDATE public.blocks
    SET grade_counts = jsonb_set(grade_counts, ARRAY[new_key], to_jsonb(coalesce((grade_counts ->> new_key)::int, 0) + 1))
    WHERE id = NEW.block_fk;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "routes_sync_block_grade_counts" ON "routes";--> statement-breakpoint
CREATE TRIGGER "routes_sync_block_grade_counts"
AFTER INSERT OR UPDATE OF block_fk, user_grade_fk, deleted_at OR DELETE ON "routes"
FOR EACH ROW EXECUTE FUNCTION public.sync_block_grade_counts();--> statement-breakpoint
-- For the backfill, and for any script that writes routes with triggers off.
CREATE OR REPLACE FUNCTION public.recount_block_grade_counts(block_ids int[]) RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE public.blocks b SET grade_counts = coalesce((
    SELECT jsonb_object_agg(c.k, c.n) FROM (
      SELECT coalesce(r.user_grade_fk::text, 'none') AS k, count(*)::int AS n
      FROM public.routes r WHERE r.block_fk = b.id AND r.deleted_at IS NULL GROUP BY 1
    ) c
  ), '{}'::jsonb)
  WHERE b.id = ANY(block_ids);
$$;--> statement-breakpoint
-- Only migrations and scripts recount; a caller could otherwise rewrite every block in every region.
REVOKE ALL ON FUNCTION public.recount_block_grade_counts(int[]) FROM PUBLIC, anon, authenticated;
