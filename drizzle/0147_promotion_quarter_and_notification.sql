-- A quarter of the membership instead of a third, since only one banner existed in all of prod. The
-- floor and ceiling stay. No backfill: past events change only if a reaction reaches them from now on.
CREATE OR REPLACE FUNCTION public.event_promotion_threshold(p_region_fk integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT least(12, greatest(3, ceil(0.25 * count(*))::integer))
  FROM public.region_members m
  WHERE m.region_fk = p_region_fk AND m.is_active;
$$;--> statement-breakpoint
-- The gates repeat three app rules in SQL: which verbs show the banner and that an accolade outranks
-- it (`card.ts`), who may be told (`notificationRecipients`), and that a file notifies about its
-- parent (`fileParent`).
CREATE OR REPLACE FUNCTION public.sync_event_promoted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_file public.files%ROWTYPE;
  v_area_fk integer;
  v_ascent_fk integer;
  v_block_fk integer;
  v_route_fk integer;
BEGIN
  -- Only a new or restored reaction from somebody else may promote. With no backfill, a retraction,
  -- a comment edit or the author's own comment on an event already over the lowered bar would
  -- otherwise announce a favorite. A reader swapping emoji still counts: it clears, then inserts.
  IF NOT (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_event FROM public.events e WHERE e.id = NEW.event_fk;

  IF NOT FOUND OR v_event.promoted OR NEW.user_fk = v_event.actor_fk THEN
    RETURN NULL;
  END IF;

  IF public.event_engagement_score(v_event.id) < public.event_promotion_threshold(v_event.region_fk) THEN
    RETURN NULL;
  END IF;

  UPDATE public.events SET promoted = true WHERE id = v_event.id;

  IF v_event.verb NOT IN ('add', 'create') THEN
    RETURN NULL;
  END IF;

  IF v_event.verb = 'create' AND EXISTS (
    SELECT 1 FROM public.ascents a WHERE a.id = v_event.ascent_fk AND a.accolade IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  v_area_fk := v_event.area_fk;
  v_ascent_fk := v_event.ascent_fk;
  v_block_fk := v_event.block_fk;
  v_route_fk := v_event.route_fk;

  IF v_event.file_fk IS NOT NULL THEN
    SELECT * INTO v_file FROM public.files f WHERE f.id = v_event.file_fk;

    IF v_file.route_fk IS NOT NULL THEN
      v_route_fk := v_file.route_fk;
    ELSIF v_file.ascent_fk IS NOT NULL THEN
      v_ascent_fk := v_file.ascent_fk;
    ELSIF v_file.block_fk IS NOT NULL THEN
      v_block_fk := v_file.block_fk;
    ELSIF v_file.area_fk IS NOT NULL THEN
      v_area_fk := v_file.area_fk;
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.notifications
    (region_fk, auth_user_fk, user_fk, source_type, event_fk, area_fk, ascent_fk, block_fk, route_fk, subject_fk)
  SELECT v_event.region_fk, m.auth_user_fk, m.user_fk, 'community_favorite', v_event.id,
    v_area_fk, v_ascent_fk, v_block_fk, v_route_fk, v_event.subject_fk
  FROM public.region_members m
  JOIN public.role_permissions p ON p.role = m.role AND p.permission = 'region.read'
  WHERE m.region_fk = v_event.region_fk AND m.user_fk = v_event.actor_fk AND m.is_active
  ON CONFLICT ON CONSTRAINT notifications_source_idx DO NOTHING;

  RETURN NULL;
END;
$$;
