-- Take the promotion helpers away from PUBLIC.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and 0117 created both of these
-- as SECURITY DEFINER so the trigger could read `reactions` and `region_members` past RLS. Together
-- that is a hole: any role reaching the database can call
--
--   select public.event_engagement_score(<any event id>)
--   select public.event_promotion_threshold(<any region id>)
--
-- and read how much engagement an event has and how many active members a region has, for regions
-- they are not in and events the reactions/events SELECT policies would never show them. It leaks
-- counts rather than content, but it leaks them across the tenancy boundary, which is the one line
-- this schema draws everywhere else.
--
-- `setup-table-permissions` does not cover this: it revokes TABLE grants and never touches
-- routines. Same shape as `custom_access_token_hook` in 0000_baseline, which is revoked for exactly
-- this reason.
--
-- The trigger keeps working. `sync_event_promoted` is itself SECURITY DEFINER and owned by the role
-- that owns these, so it still has EXECUTE; only callers coming in through the API lose it.
--
-- Its own migration rather than an edit to 0117, because a database that already ran 0117 would
-- never see the change (see 0118, which exists for the same reason).
REVOKE ALL ON FUNCTION public.event_engagement_score(integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.event_promotion_threshold(integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.event_engagement_score(integer) FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.event_promotion_threshold(integer) FROM anon, authenticated;
