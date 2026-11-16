CREATE TABLE "apple_mail_forwarding" (
	"address_hash" text NOT NULL,
	"auth_user_fk" uuid PRIMARY KEY NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"forwarding" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apple_mail_forwarding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "apple_mail_forwarding" ADD CONSTRAINT "apple_mail_forwarding_auth_user_fk_users_id_fk" FOREIGN KEY ("auth_user_fk") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

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

    -- 3b. last way in: removing Apple or Google needs a password or another provider left. The lock makes a
    -- concurrent removal wait, and its next statement then counts what this one committed.
    if tg_op = 'DELETE' and ident.provider in ('apple', 'google') then
      select * into account from auth.users where id = ident.user_id for update;
      if coalesce(account.encrypted_password, '') = '' and not exists (
        select 1 from auth.identities i
          where i.user_id = ident.user_id and i.id <> ident.id and i.provider in ('apple', 'google')
      ) then
        raise exception 'last sign-in method of user %', ident.user_id using errcode = '42501';
      end if;
    end if;
    -- 2b. the Apple identity an Apple notification removes, named by its own transaction (after the floor)
    if tg_op = 'DELETE' and ident.provider = 'apple'
      and current_setting('grnyte.apple_identity_removal', true) = ident.user_id::text || ':' || ident.provider_id then
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
  $$;
