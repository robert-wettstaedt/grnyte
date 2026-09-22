-- The lookups the invite flow needs and the RLS role cannot make: `auth.users` is readable by
-- neither `authenticated` nor `app_writer`, so each one used to run on a SECOND pooled connection
-- taken from inside the handler's own RLS transaction. A definer answers on the caller's.
--
-- `SET search_path TO ''` on all three, like `authorize`: a definer without one resolves its
-- unqualified names through whatever the CALLER's search_path happens to be.
--
-- All three RAISE when the gate denies rather than answering. A gate that returns the same value
-- as a negative answer is fail-open: the caller cannot tell "not a member" from "not allowed to
-- ask", and skips the guard it exists to enforce.
--
-- `region.admin`, not `region.edit`: that is what `canEditRegion` requires of every caller
-- (permissions.ts), and `region_maintainer` holds `region.edit` but reaches none of these paths.

-- Belt and braces, not the thing that makes the two sides match: every live caller already passes
-- a JS `normalizeEmail`d address and `auth.users` stores them clean. It could not BE the
-- equivalence anyway, since JS `.trim()` strips all Unicode whitespace while this strips six ASCII
-- characters. It has to be idempotent on an already-clean address and catch a caller who forgets.
-- Bare `trim()` would not: it is `btrim(text, ' ')`, so it leaves a tab behind.
CREATE OR REPLACE FUNCTION public.normalized_email(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$ select lower(btrim(raw, E' \t\n\r\f\v')) $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.account_for_email(region_id integer, lookup_email text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  declare
    account_id integer;
  begin
    -- Gated: email -> account is account enumeration. A region admin already sees the members and
    -- pending invitations of their own region, so this tells them nothing that screen does not.
    if not public.authorize_in_region('region.admin'::public.app_permission, region_id) then
      raise exception 'not authorized for region %', region_id using errcode = '42501';
    end if;

    select u.id into account_id
    from public.users u
    join auth.users au on au.id = u.auth_user_fk
    where public.normalized_email(au.email) = public.normalized_email(lookup_email)
    limit 1;

    return account_id;
  end;
$$;--> statement-breakpoint

-- Gated like the others rather than left open: its only caller already holds the region, and
-- resting on the Data API being switched off would make a runtime setting the whole defence.
CREATE OR REPLACE FUNCTION public.contact_locale_for_email(region_id integer, lookup_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  declare
    locale text;
  begin
    if not public.authorize_in_region('region.admin'::public.app_permission, region_id) then
      raise exception 'not authorized for region %', region_id using errcode = '42501';
    end if;

    select us.contact_locale into locale
    from public.user_settings us
    join auth.users au on au.id = us.auth_user_fk
    where public.normalized_email(au.email) = public.normalized_email(lookup_email)
    limit 1;

    return locale;
  end;
$$;--> statement-breakpoint

-- Membership by address, for the guard that stops an invitation nobody could ever accept.
CREATE OR REPLACE FUNCTION public.is_active_member_by_email(region_id integer, lookup_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  begin
    if not public.authorize_in_region('region.admin'::public.app_permission, region_id) then
      raise exception 'not authorized for region %', region_id using errcode = '42501';
    end if;

    return exists (
      select 1
      from public.region_members rm
      join auth.users au on au.id = rm.auth_user_fk
      where rm.region_fk = region_id
        and rm.is_active = true
        and public.normalized_email(au.email) = public.normalized_email(lookup_email)
    );
  end;
$$;--> statement-breakpoint

-- The older two-argument shape, from before `contact_locale_for_email` was gated. Dropped so no
-- caller can reach the ungated one.
DROP FUNCTION IF EXISTS public.contact_locale_for_email(text);--> statement-breakpoint

-- Narrower than `authorize_in_region`, which is granted to PUBLIC because RLS policies evaluate it
-- as whoever is reading. These are called from application code only, so `authenticated` is the
-- widest anything needs; `app_writer` reaches them by inheriting it.
REVOKE ALL ON FUNCTION public.account_for_email(integer, text) FROM PUBLIC, anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.contact_locale_for_email(integer, text) FROM PUBLIC, anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_active_member_by_email(integer, text) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.account_for_email(integer, text) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.contact_locale_for_email(integer, text) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_active_member_by_email(integer, text) TO authenticated;
