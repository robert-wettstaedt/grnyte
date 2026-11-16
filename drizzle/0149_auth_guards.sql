-- Auth guards Idempotent: every hosted project gets
-- it through `npm run migrate`, and re-running it by hand must succeed.

-- Allows an email sign-up only with grnyte's marker (`SIGNUP_MARKER` in `$lib/auth`), and social ones.
CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path = ''
  AS $$
    select case
      when event->'user'->'app_metadata'->>'provider' in ('apple', 'google')
        or event->'user'->'app_metadata'->>'signup' = 'grnyte'
      then '{}'::jsonb
      else '{"error": {"http_code": 403, "message": "Signup is not allowed"}}'::jsonb
    end
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.before_user_created_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin;--> statement-breakpoint

-- The one list of domains a provider owns.
CREATE OR REPLACE FUNCTION public.provider_owned_domains(provider text) RETURNS text[]
  LANGUAGE sql IMMUTABLE SET search_path = ''
  AS $$
    select case provider
      when 'google' then array['gmail.com', 'googlemail.com']
      when 'apple' then array['icloud.com', 'me.com', 'mac.com', 'privaterelay.appleid.com']
      else array[]::text[]
    end
  $$;--> statement-breakpoint

-- Transaction-local markers: the ids of accounts this transaction created or deletes, a list since
-- one statement can delete many and their cascades run after its last row.
CREATE OR REPLACE FUNCTION public.mark_auth_user_created() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  AS $$
  begin
    perform set_config('grnyte.auth_user_created', concat_ws(',', nullif(current_setting('grnyte.auth_user_created', true), ''), NEW.id), true);
    return null;
  end
  $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mark_auth_user_deleting() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  AS $$
  begin
    perform set_config('grnyte.auth_user_deleting', concat_ws(',', nullif(current_setting('grnyte.auth_user_deleting', true), ''), OLD.id), true);
    return OLD;
  end
  $$;--> statement-breakpoint

-- Refuses attaching, moving or removing a sign-in method on a confirmed account unless one rule allows it.
CREATE OR REPLACE FUNCTION public.guard_auth_identity() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  AS $$
  declare
    ident auth.identities;
    account auth.users;
    spent uuid;
  begin
    if tg_op = 'DELETE' then ident := OLD; else ident := NEW; end if;

    -- 1. account created in this transaction
    if ident.user_id::text = any (string_to_array(current_setting('grnyte.auth_user_created', true), ',')) then
      return ident;
    end if;
    -- 2. cascade of an account delete
    if tg_op = 'DELETE'
      and ident.user_id::text = any (string_to_array(current_setting('grnyte.auth_user_deleting', true), ',')) then
      return ident;
    end if;

    select * into account from auth.users where id = ident.user_id;
    -- 3. unconfirmed account (a cascade finds none: rule 2 covers it)
    if found and account.email_confirmed_at is null then
      return ident;
    end if;

    if tg_op <> 'DELETE' then
      -- 4. GoTrue's own email identity for the account's address; a secure email change writes it
      -- for the new address before it updates `auth.users.email`
      if ident.provider = 'email'
        and lower(ident.identity_data->>'email') in (lower(account.email), lower(account.email_change)) then
        return ident;
      end if;
      -- 5. a provider that owns the account's domain, reporting the account's address
      if lower(split_part(account.email, '@', 2)) = any (public.provider_owned_domains(ident.provider))
        and lower(ident.identity_data->>'email') = lower(account.email) then
        return ident;
      end if;
    end if;

    -- 6. a live grant naming this change, spent here
    delete from public.reauth_grants
      where id = (
        select g.id from public.reauth_grants g
          where g.auth_user_fk = ident.user_id
            and g.expires_at > now()
            and case when tg_op = 'DELETE'
              then g.action = 'identity.unlink' and g.target = ident.provider
              else g.action = 'identity.link' and g.target = ident.provider || ':' || ident.provider_id
            end
          limit 1
          for update
      )
      returning id into spent;
    if spent is not null then
      return ident;
    end if;

    raise exception 'identity change refused for user %', ident.user_id using errcode = '42501';
  end
  $$;--> statement-breakpoint

DROP TRIGGER IF EXISTS mark_auth_user_created ON auth.users;--> statement-breakpoint
CREATE TRIGGER mark_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.mark_auth_user_created();--> statement-breakpoint
DROP TRIGGER IF EXISTS mark_auth_user_deleting ON auth.users;--> statement-breakpoint
CREATE TRIGGER mark_auth_user_deleting BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.mark_auth_user_deleting();--> statement-breakpoint
DROP TRIGGER IF EXISTS guard_auth_identity ON auth.identities;--> statement-breakpoint
CREATE TRIGGER guard_auth_identity BEFORE INSERT OR DELETE OR UPDATE OF user_id, provider, provider_id ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION public.guard_auth_identity();
